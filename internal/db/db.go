// Package db opens the instance's SQLite database with the pragmas the
// architecture notes require and applies embedded migrations.
package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite" // pure-Go driver: no cgo, single binary
)

// Open opens (creating if needed) the database at path.
//
// Pragmas: WAL so readers never block the writer; busy_timeout so a second
// writer waits instead of failing; synchronous=NORMAL (safe under WAL);
// foreign keys on. _txlock=immediate makes every transaction begin with
// BEGIN IMMEDIATE, so a read-then-write transaction can never hit
// SQLITE_BUSY_SNAPSHOT.
func Open(path string) (*sql.DB, error) {
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	q.Add("_pragma", "foreign_keys(ON)")
	q.Set("_txlock", "immediate")
	dsn := "file:" + path + "?" + q.Encode()

	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// One process per instance and a write rate of a few per minute:
	// a small pool is plenty, and it keeps lock contention trivial.
	d.SetMaxOpenConns(4)
	d.SetConnMaxLifetime(0)
	if err := d.Ping(); err != nil {
		d.Close()
		return nil, err
	}
	return d, nil
}

// Migrate applies every *.sql file in migrations, in name order, that has
// not been applied yet. Forward-only. Each file runs in one transaction on
// one connection with foreign keys off, which is SQLite's documented way to
// rebuild a table that others reference; foreign_key_check runs after each
// file, so a migration that leaves a dangling reference fails.
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
	for _, name := range names {
		var n int
		if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations WHERE name = ?`, name).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		body, err := fs.ReadFile(migrations, name)
		if err != nil {
			return err
		}
		tx, err := d.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`,
			name, time.Now().UnixMilli()); err != nil {
			tx.Rollback()
			return err
		}
		var table, rowid, parent, index any
		if err := tx.QueryRowContext(ctx, `PRAGMA foreign_key_check`).Scan(&table, &rowid, &parent, &index); err == nil {
			tx.Rollback()
			return fmt.Errorf("migration %s: foreign key violation in %v (row %v) -> %v", name, table, rowid, parent)
		} else if !errors.Is(err, sql.ErrNoRows) {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// Now returns the current time as Unix milliseconds. UTC only, ever.
func Now() int64 { return time.Now().UnixMilli() }

// IsUniqueViolation reports whether err is a UNIQUE constraint failure.
func IsUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
