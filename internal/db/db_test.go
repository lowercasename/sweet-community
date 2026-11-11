package db

import (
	"context"
	"database/sql"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"testing/fstest"
)

func file(s string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(s)} }

// A migration on a database that has been migrated before is an upgrade,
// and an upgrade copies the database first.
func TestMigrateCopiesTheDatabaseBeforeAnUpgrade(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "sweet.db")
	copyPath := path + ".before-upgrade"
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()

	first := fstest.MapFS{"001_a.sql": file(`CREATE TABLE a (id INTEGER PRIMARY KEY);`)}
	if err := Migrate(ctx, d, first); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(copyPath); !os.IsNotExist(err) {
		t.Fatalf("a fresh database was copied before its first migrations (%v)", err)
	}
	if _, err := d.ExecContext(ctx, `INSERT INTO a (id) VALUES (1)`); err != nil {
		t.Fatal(err)
	}

	second := fstest.MapFS{"001_a.sql": first["001_a.sql"], "002_b.sql": file(`CREATE TABLE b (id INTEGER PRIMARY KEY);`)}
	if err := Migrate(ctx, d, second); err != nil {
		t.Fatal(err)
	}
	rows := func(p, query string) int {
		t.Helper()
		c, err := Open(p)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		var n int
		if err := c.QueryRowContext(ctx, query).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := rows(copyPath, `SELECT COUNT(*) FROM a`); n != 1 {
		t.Fatalf("the copy has %d rows in a, want the 1 that was there before the upgrade", n)
	}
	if n := rows(copyPath, `SELECT COUNT(*) FROM sqlite_master WHERE name = 'b'`); n != 0 {
		t.Fatal("the copy has the table the upgrade added: it was taken after, not before")
	}

	// When no migration is pending, the copy from the last upgrade is not replaced.
	if _, err := d.ExecContext(ctx, `INSERT INTO a (id) VALUES (2)`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, d, second); err != nil {
		t.Fatal(err)
	}
	if n := rows(copyPath, `SELECT COUNT(*) FROM a`); n != 1 {
		t.Fatalf("a start with nothing to migrate replaced the copy (%d rows)", n)
	}

	// The next upgrade replaces the copy.
	third := fstest.MapFS{"001_a.sql": first["001_a.sql"], "002_b.sql": second["002_b.sql"], "003_c.sql": file(`CREATE TABLE c (id INTEGER PRIMARY KEY);`)}
	if err := Migrate(ctx, d, third); err != nil {
		t.Fatal(err)
	}
	if n := rows(copyPath, `SELECT COUNT(*) FROM a`); n != 2 {
		t.Fatalf("the copy was not replaced at the next upgrade (%d rows)", n)
	}
}

// When Litestream is running, the binary leaves checkpointing to Litestream.
func TestLitestreamOwnsCheckpoints(t *testing.T) {
	ctx := context.Background()
	check := func(opts ...Option) int {
		t.Helper()
		d, err := Open(filepath.Join(t.TempDir(), "sweet.db"), opts...)
		if err != nil {
			t.Fatal(err)
		}
		defer d.Close()
		var n int
		if err := d.QueryRowContext(ctx, `PRAGMA wal_autocheckpoint`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if n := check(); n == 0 {
		t.Fatal("without Litestream the database must checkpoint itself")
	}
	if n := check(LitestreamOwnsCheckpoints); n != 0 {
		t.Fatalf("wal_autocheckpoint = %d with Litestream, want 0", n)
	}
}

// Migrations 001 to 028 were squashed into 001_v1.sql before v1.0.0.
// A database that had run 028_signin.sql
// already has that schema, so it is recorded as having run 001_v1.sql, and its
// rows are kept. A database from before 028 cannot be upgraded by this binary,
// and Migrate says so instead of running the baseline over it.
func TestMigrateCountsASquashedDatabaseAsAtTheBaseline(t *testing.T) {
	ctx := context.Background()
	open := func(name string) *sql.DB {
		d, err := Open(filepath.Join(t.TempDir(), name))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { d.Close() })
		return d
	}
	v1 := fstest.MapFS{"001_v1.sql": file(`CREATE TABLE a (id INTEGER PRIMARY KEY);`), "002_b.sql": file(`CREATE TABLE b (id INTEGER PRIMARY KEY);`)}

	// A database that ran every migration up to 028 has the baseline's schema and a row of its own.
	d := open("old.db")
	if _, err := d.Exec(`CREATE TABLE a (id INTEGER PRIMARY KEY); INSERT INTO a VALUES (7);
		CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
		INSERT INTO schema_migrations VALUES ('001_init.sql', 1), ('027_event_keys.sql', 1), ('028_signin.sql', 1);`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, d, v1); err != nil {
		t.Fatal(err)
	}
	var names []string
	rows, _ := d.Query(`SELECT name FROM schema_migrations ORDER BY name`)
	for rows.Next() {
		var n string
		rows.Scan(&n)
		names = append(names, n)
	}
	rows.Close()
	if len(names) != 2 || names[0] != "001_v1.sql" || names[1] != "002_b.sql" {
		t.Fatalf("recorded migrations: %v", names)
	}
	var kept int
	if err := d.QueryRow(`SELECT id FROM a`).Scan(&kept); err != nil || kept != 7 {
		t.Fatalf("the old row: %d %v", kept, err)
	}

	// A database that stopped before 028 is refused.
	early := open("early.db")
	if _, err := early.Exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
		INSERT INTO schema_migrations VALUES ('001_init.sql', 1), ('020_search_trigram.sql', 1);`); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, early, v1); err == nil {
		t.Fatal("a database from before 028 was migrated")
	}
}

// An upgrade runs all of its migrations in one transaction. When one fails, none of them stays, so the release before
// it still accepts the database, and the copy taken before the upgrade is still the database as it was before.
func TestAFailedUpgradeChangesNothing(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "sweet.db")
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	before := fstest.MapFS{"001_a.sql": file(`CREATE TABLE a (id INTEGER PRIMARY KEY);`)}
	if err := Migrate(ctx, d, before); err != nil {
		t.Fatal(err)
	}
	failing := fstest.MapFS{
		"001_a.sql": before["001_a.sql"],
		"002_b.sql": file(`CREATE TABLE b (id INTEGER PRIMARY KEY); INSERT INTO a (id) VALUES (1);`),
		"003_c.sql": file(`SELECT * FROM no_such_table;`),
	}
	// The upgrade is tried twice, as a restarting server tries it.
	for range 2 {
		if err := Migrate(ctx, d, failing); err == nil {
			t.Fatal("an upgrade with a failing migration succeeded")
		}
	}
	for _, db := range []string{path, path + BackupSuffix} {
		c, err := Open(db)
		if err != nil {
			t.Fatal(err)
		}
		var tables, rows, migrations int
		if err := c.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM sqlite_schema WHERE name = 'b'),
			(SELECT COUNT(*) FROM a), (SELECT COUNT(*) FROM schema_migrations)`).Scan(&tables, &rows, &migrations); err != nil {
			t.Fatal(err)
		}
		c.Close()
		if tables != 0 || rows != 0 || migrations != 1 {
			t.Fatalf("%s after the failed upgrade: table b %d, rows in a %d, migrations recorded %d", filepath.Base(db), tables, rows, migrations)
		}
	}
	if err := Migrate(ctx, d, before); err != nil {
		t.Fatalf("the release before the upgrade refuses the database: %v", err)
	}
}

// Migration 005 releases the pictures of rooms deleted before it. A deleted room kept its picture, and the image sweep
// failed on that picture and stopped.
func TestMigrationReleasesThePicturesOfDeletedRooms(t *testing.T) {
	ctx := context.Background()
	d, err := Open(filepath.Join(t.TempDir(), "sweet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	migratedTo(t, d, "004")
	for _, q := range []string{
		`INSERT INTO users (id, username, created_at) VALUES ('u', 'kit', 1)`,
		`INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES ('a', 'u', 'image/png', 1, 1, 1, 1), ('b', 'u', 'image/png', 1, 1, 1, 1)`,
		`INSERT INTO groups (id, kind, name, created_at, picture_id, deleted_at) VALUES ('deleted', 'group', 'Moors', 1, 'a', 2), ('live', 'group', 'Fells', 1, 'b', NULL)`,
	} {
		if _, err := d.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	migratedTo(t, d, "005")
	pictures := map[string]sql.NullString{}
	rows, err := d.QueryContext(ctx, `SELECT id, picture_id FROM groups WHERE id IN ('deleted', 'live')`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id string
		var pic sql.NullString
		rows.Scan(&id, &pic)
		pictures[id] = pic
	}
	rows.Close()
	if pictures["deleted"].Valid || pictures["live"].String != "b" {
		t.Fatalf("pictures after the migration: %v, want the deleted room's released and the live room's kept", pictures)
	}
}

// Migration 006 records the images that existing posts, comments, messages and report copies use, from their <img>
// elements. An image id written as text is not a use.
func TestMigrationRecordsTheImagesThatBodiesUse(t *testing.T) {
	ctx := context.Background()
	d, err := Open(filepath.Join(t.TempDir(), "sweet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	migratedTo(t, d, "005")
	const root = "00000000-0000-7000-8000-000000000000"
	img := func(id string) string { return `<img src="/img/` + id + `" alt="">` }
	const a, b, c, e, x = "0190a0b0-0000-7000-8000-00000000000a", "0190a0b0-0000-7000-8000-00000000000b",
		"0190a0b0-0000-7000-8000-00000000000c", "0190a0b0-0000-7000-8000-00000000000e",
		"0190a0b0-0000-7000-8000-0000000000ff"
	for _, q := range []string{
		`INSERT INTO users (id, username, created_at) VALUES ('u', 'kit', 1), ('v', 'mo', 1)`,
		`INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES ('` + a + `', 'u', 'image/png', 1, 1, 1, 1), ('` + b + `', 'u', 'image/png', 1, 1, 1, 1), ('` + c + `', 'u', 'image/png', 1, 1, 1, 1), ('` + e + `', 'u', 'image/png', 1, 1, 1, 1), ('` + x + `', 'u', 'image/png', 1, 1, 1, 1)`,
		`INSERT INTO posts (id, group_id, author_id, body_html, body_text, created_at) VALUES ('p', '` + root + `', 'u', '<p>x</p>` + img(a) + `', 'x', 1)`,
		`INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES ('c', 'p', 'u', '` + img(b) + `', '', 1)`,
		`INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) VALUES ('m', '` + root + `', 'u', '` + img(c) + `', '', 1), ('t', '` + root + `', 'u', '<p>` + x + `</p>', '` + x + `', 1)`,
		`INSERT INTO reports (id, reporter_id, kind, subject_id, group_id, author_id, body_html, reason, created_at) VALUES ('r', 'v', 'post', 'p', '` + root + `', 'u', '` + img(e) + `', '', 1)`,
	} {
		if _, err := d.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	migratedTo(t, d, "006")
	var uses []string
	rows, err := d.QueryContext(ctx, `SELECT kind || ' ' || id || ' ' || image_id FROM image_uses ORDER BY 1`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var s string
		rows.Scan(&s)
		uses = append(uses, s)
	}
	rows.Close()
	want := []string{"comment c " + b, "message m " + c, "post p " + a, "report r " + e}
	if !slices.Equal(uses, want) {
		t.Fatalf("uses after the migration:\n%v\nwant\n%v", uses, want)
	}
}

// migratedTo opens a new database and applies the migrations up to and including the one whose name starts with
// prefix.
func migratedTo(t *testing.T, d *sql.DB, prefix string) {
	t.Helper()
	all := os.DirFS("../../migrations")
	names, err := fs.Glob(all, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	files := fstest.MapFS{}
	for _, name := range names {
		if name[:3] <= prefix {
			data, _ := fs.ReadFile(all, name)
			files[name] = &fstest.MapFile{Data: data}
		}
	}
	if err := Migrate(context.Background(), d, files); err != nil {
		t.Fatal(err)
	}
}

// Migration 009 rebuilds the search index with search_entries, which holds the rowid of each entry. The rebuilt index
// holds the live posts, comments and messages only. Each search_entries row points at its own entry, and an edit after
// the migration replaces the entry.
func TestMigrationRebuildsTheSearchIndex(t *testing.T) {
	ctx := context.Background()
	d, err := Open(filepath.Join(t.TempDir(), "sweet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	migratedTo(t, d, "008")
	const root = "00000000-0000-7000-8000-000000000000"
	for _, q := range []string{
		`INSERT INTO users (id, username, created_at) VALUES ('u', 'kit', 1)`,
		`INSERT INTO groups (id, kind, name, created_at, deleted_at) VALUES ('gone', 'group', '', 1, 2)`,
		`INSERT INTO posts (id, group_id, author_id, body_html, body_text, created_at) VALUES
			('p', '` + root + `', 'u', '', 'live post', 1), ('old', '` + root + `', 'u', '', 'deleted post', 1),
			('room', 'gone', 'u', '', 'post in a deleted room', 1)`,
		`UPDATE posts SET deleted_at = 2 WHERE id = 'old'`,
		`INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES
			('c', 'p', 'u', '', 'live comment', 1), ('under', 'old', 'u', '', 'comment on a deleted post', 1)`,
		`INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) VALUES
			('m', '` + root + `', 'u', '', 'live message', 1), ('there', 'gone', 'u', '', 'message in a deleted room', 1)`,
	} {
		if _, err := d.ExecContext(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	migratedTo(t, d, "009")
	entries := func() []string {
		t.Helper()
		rows, err := d.QueryContext(ctx, `SELECT e.kind || ' ' || e.id || ' ' || s.text FROM search_entries e
			JOIN search s ON s.rowid = e.entry ORDER BY 1`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		// Every entry has one search_entries row, and every search_entries row has its entry.
		var entries, rowids, orphans int
		if err := d.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM search), (SELECT COUNT(*) FROM search_entries),
			(SELECT COUNT(*) FROM search_entries e LEFT JOIN search s ON s.rowid = e.entry WHERE s.rowid IS NULL)`).Scan(&entries, &rowids, &orphans); err != nil {
			t.Fatal(err)
		}
		if entries != len(out) || rowids != len(out) || orphans != 0 {
			t.Fatalf("search has %d entries and search_entries %d rows, %d without an entry, for %d matches", entries, rowids, orphans, len(out))
		}
		return out
	}
	want := []string{"comment c live comment", "message m live message", "post p live post"}
	if got := entries(); !slices.Equal(got, want) {
		t.Fatalf("entries after the migration:\n%v\nwant\n%v", got, want)
	}
	if _, err := d.ExecContext(ctx, `UPDATE posts SET body_text = 'edited post' WHERE id = 'p'`); err != nil {
		t.Fatal(err)
	}
	want = []string{"comment c live comment", "message m live message", "post p edited post"}
	if got := entries(); !slices.Equal(got, want) {
		t.Fatalf("entries after an edit:\n%v\nwant\n%v", got, want)
	}
}

// A database that ran migrations 006 and 007 of v1.6.1 has no live_bodies view, because both were changed before
// v1.6.2 and a migration that has run is not run again. The later migrations run on it, and it ends with the same views
// as any other database.
func TestMigrationsRunOnADatabaseFromV161(t *testing.T) {
	ctx := context.Background()
	d, err := Open(filepath.Join(t.TempDir(), "sweet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	migratedTo(t, d, "008")
	// The views as v1.6.1 created them.
	if _, err := d.ExecContext(ctx, `DROP VIEW image_references; DROP VIEW live_link_uses; DROP VIEW live_image_uses;
		DROP VIEW live_bodies;
		CREATE VIEW live_image_uses AS
    SELECT u.image_id, u.kind, p.group_id FROM image_uses u
        JOIN posts p ON u.kind = 'post' AND p.id = u.id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, p.group_id FROM image_uses u
        JOIN comments c ON u.kind = 'comment' AND c.id = u.id AND c.deleted_at IS NULL
        JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, x.group_id FROM image_uses u
        JOIN messages x ON u.kind = 'message' AND x.id = u.id AND x.deleted_at IS NULL
        JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, r.group_id FROM image_uses u
        JOIN reports r ON u.kind = 'report' AND r.id = u.id AND r.closed_at IS NULL;
		CREATE VIEW live_link_uses AS
    SELECT u.url FROM link_uses u
        JOIN posts p ON u.kind = 'post' AND p.id = u.id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.url FROM link_uses u
        JOIN comments c ON u.kind = 'comment' AND c.id = u.id AND c.deleted_at IS NULL
        JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.url FROM link_uses u
        JOIN messages x ON u.kind = 'message' AND x.id = u.id AND x.deleted_at IS NULL
        JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL;
		CREATE VIEW image_references AS
			SELECT picture_id AS image_id FROM users WHERE picture_id IS NOT NULL
			UNION ALL
			SELECT picture_id FROM groups WHERE picture_id IS NOT NULL AND deleted_at IS NULL
			UNION ALL
			SELECT image_id FROM link_previews WHERE image_id IS NOT NULL
			UNION ALL
			SELECT image_id FROM live_image_uses;`); err != nil {
		t.Fatal(err)
	}
	migratedTo(t, d, "010")
	for _, view := range []string{"live_bodies", "live_image_uses", "live_link_uses", "image_references"} {
		var n int
		if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+view).Scan(&n); err != nil {
			t.Fatalf("%s after the migrations: %v", view, err)
		}
	}
	var uses string
	if err := d.QueryRowContext(ctx, `SELECT sql FROM sqlite_schema WHERE name = 'live_image_uses'`).Scan(&uses); err != nil || !strings.Contains(uses, "live_bodies") {
		t.Fatalf("live_image_uses after the migrations is not built on live_bodies: %v\n%s", err, uses)
	}
}

// SQLite overwrites deleted and replaced content with zeros, and the search index removes an entry at once when its
// row is deleted or edited, so emptied text does not stay in the database file.
func TestSecureDeleteIsOn(t *testing.T) {
	ctx := context.Background()
	d, err := Open(filepath.Join(t.TempDir(), "sweet.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if err := Migrate(ctx, d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	var on, search int
	if err := d.QueryRowContext(ctx, `PRAGMA secure_delete`).Scan(&on); err != nil || on != 1 {
		t.Fatalf("secure_delete = %d %v, want 1", on, err)
	}
	if err := d.QueryRowContext(ctx, `SELECT v FROM search_config WHERE k = 'secure-delete'`).Scan(&search); err != nil || search != 1 {
		t.Fatalf("the search index's secure-delete = %d %v, want 1", search, err)
	}
}
