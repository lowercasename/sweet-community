// Package db opens the instance's SQLite database with its pragmas and applies the embedded migrations.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite" // pure-Go driver, so no cgo and a single binary
)

// An Option adjusts how the database is opened.
type Option func(q url.Values)

// LitestreamOwnsCheckpoints turns the automatic WAL checkpoint off. It is
// used when Litestream replicates the database, because Litestream
// checkpoints itself after it has copied the pages.
func LitestreamOwnsCheckpoints(q url.Values) { q.Add("_pragma", "wal_autocheckpoint(0)") }

// Open opens the database at path, creating it if it does not exist.
//
// The pragmas are as follows. WAL mode means readers never block the writer. busy_timeout means a second writer waits
// instead of failing. synchronous=NORMAL is safe under WAL. Foreign keys are on. secure_delete makes SQLite overwrite
// deleted and replaced content with zeros, so emptied text does not stay in the file. _txlock=immediate makes every
// transaction begin with BEGIN IMMEDIATE, so a transaction that reads and then writes can never fail with
// SQLITE_BUSY_SNAPSHOT.
func Open(path string, opts ...Option) (*sql.DB, error) {
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	q.Add("_pragma", "foreign_keys(ON)")
	q.Add("_pragma", "secure_delete(ON)")
	for _, o := range opts {
		o(q)
	}
	q.Set("_txlock", "immediate")
	dsn := "file:" + path + "?" + q.Encode()

	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// There is one process per instance and a write rate of a few per minute,
	// so a small pool is sufficient and keeps lock contention low.
	d.SetMaxOpenConns(4)
	d.SetConnMaxLifetime(0)
	if err := d.Ping(); err != nil {
		d.Close()
		return nil, err
	}
	return d, nil
}

// BackupSuffix is the suffix of the copy of the database taken before an
// upgrade's migrations. The copy is written next to the database at
// <path>.before-upgrade.
const BackupSuffix = ".before-upgrade"

// Migrate applies every *.sql file in migrations that has not been applied yet, in name order. Migrations are
// forward-only. All the pending files run in one transaction, so when one fails, none of them stays and the release
// before still accepts the database. The transaction runs on one connection with foreign keys off, which is SQLite's
// documented way to rebuild a table that other tables reference. foreign_key_check runs after each file, so a
// migration that leaves a dangling reference fails.
//
// When the database has been migrated before, the run is an upgrade. A VACUUM INTO copy is taken first and replaces
// the previous copy, so a migration that succeeds but turns out wrong is recoverable. A new database is not copied.
func Migrate(ctx context.Context, db *sql.DB, migrations fs.FS) error {
	conn, err := db.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()
	d := conn
	if _, err := d.ExecContext(ctx, `PRAGMA foreign_keys = OFF`); err != nil {
		return err
	}
	defer d.ExecContext(context.Background(), `PRAGMA foreign_keys = ON`)
	if _, err := d.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	if err := squashed(ctx, d, names); err != nil {
		return err
	}
	var applied int
	if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&applied); err != nil {
		return err
	}
	var pending []string
	for _, name := range names {
		var n int
		if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name = ?`, name).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			pending = append(pending, name)
		}
	}
	if applied > 0 && len(pending) > 0 {
		if err := backup(ctx, d, BackupSuffix); err != nil {
			return fmt.Errorf("copy before upgrade: %w", err)
		}
	}
	if len(pending) == 0 {
		return nil
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, name := range pending {
		body, err := fs.ReadFile(migrations, name)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`,
			name, time.Now().UnixMilli()); err != nil {
			return err
		}
		var table, rowid, parent, index any
		if err := tx.QueryRowContext(ctx, `PRAGMA foreign_key_check`).Scan(&table, &rowid, &parent, &index); err == nil {
			return fmt.Errorf("migration %s: foreign key violation in %v (row %v) -> %v", name, table, rowid, parent)
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return tx.Commit()
}

// Migrations 001 to 028 were squashed into one file before v1.0.0.
// lastSquashed is the last of them.
const (
	lastSquashed = "028_signin.sql"
	baseline     = "001_v1.sql"
)

// squashed records a database that ran every migration up to lastSquashed as
// having run the baseline instead, because it already has the baseline's
// schema. A database that recorded a migration this binary does not have is
// refused. That is a database from before 028, which the baseline must not
// run over, or a database that a newer release migrated.
func squashed(ctx context.Context, d *sql.Conn, names []string) error {
	known := map[string]bool{}
	for _, n := range names {
		known[n] = true
	}
	if !known[baseline] {
		return nil
	}
	var old int
	if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name = ?`, lastSquashed).Scan(&old); err != nil {
		return err
	}
	if old > 0 {
		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if _, err := tx.ExecContext(ctx, `DELETE FROM schema_migrations`); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`, baseline, time.Now().UnixMilli()); err != nil {
			return err
		}
		return tx.Commit()
	}
	rows, err := d.QueryContext(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return err
		}
		if !known[n] {
			return fmt.Errorf("the database was migrated by %s, which this release does not have. A database from before v1 needs the last release before v1.0.0 first, and one from a newer release needs that release", n)
		}
	}
	return rows.Err()
}

// backup writes a single-file copy of the open database next to it, at its
// path plus suffix. It replaces any earlier copy.
func backup(ctx context.Context, d *sql.Conn, suffix string) error {
	var seq int
	var name, file string
	if err := d.QueryRowContext(ctx, `PRAGMA database_list`).Scan(&seq, &name, &file); err != nil {
		return err
	}
	target := file + suffix
	if err := os.Remove(target); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	_, err := d.ExecContext(ctx, `VACUUM INTO ?`, target)
	return err
}

// Now returns the current time as Unix milliseconds. All times are UTC.
func Now() int64 { return time.Now().UnixMilli() }

// IsUniqueViolation reports whether err is a UNIQUE constraint failure.
func IsUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
