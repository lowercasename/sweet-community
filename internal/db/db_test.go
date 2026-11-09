package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
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
