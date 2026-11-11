package db

import (
	"context"
	"database/sql"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
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
