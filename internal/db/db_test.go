package db

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func file(s string) *fstest.MapFile { return &fstest.MapFile{Data: []byte(s)} }

// A migration on a database that has been migrated before is an upgrade,
// and an upgrade copies the database first (architecture.md, Config:
// "a VACUUM INTO copy is taken first so a bad migration is recoverable").
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

// When Litestream is running, the binary leaves checkpointing to Litestream
// (architecture.md, Backups: wal_autocheckpoint=0 in the app).
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
