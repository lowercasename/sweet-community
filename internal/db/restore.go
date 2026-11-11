package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
)

// Restore installs a standalone SQLite backup without running migrations.
// Sweet and Litestream must be stopped. The returned directory keeps the old database and its companion files.
func Restore(ctx context.Context, path, source string) (recovery string, err error) {
	stage, err := os.MkdirTemp(filepath.Dir(path), ".sweet-restore-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage)
	candidate := filepath.Join(stage, "sweet.db")
	for _, suffix := range []string{"-wal", "-journal"} {
		info, err := os.Stat(source + suffix)
		if err == nil && info.Size() > 0 {
			return "", fmt.Errorf("restore requires a standalone backup without %s", suffix)
		}
		if err != nil && !os.IsNotExist(err) {
			return "", err
		}
	}
	if err := copyDatabaseFile(source, candidate); err != nil {
		return "", err
	}
	if err := checkRestore(ctx, candidate); err != nil {
		return "", fmt.Errorf("check restored database: %w", err)
	}

	recovery, err = os.MkdirTemp(filepath.Dir(path), filepath.Base(path)+".before-restore-")
	if err != nil {
		return "", err
	}
	// Copy every file before changing any of them. A failed copy leaves the current database intact.
	for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
		if err := copyDatabaseFile(path+suffix, filepath.Join(recovery, filepath.Base(path)+suffix)); err != nil && !os.IsNotExist(err) {
			os.RemoveAll(recovery)
			return "", fmt.Errorf("preserve current database: %w", err)
		}
	}
	if err := ctx.Err(); err != nil {
		return recovery, err
	}
	// Move companion files aside before the atomic database replacement. If it fails, put them back.
	var moved []string
	defer func() {
		if err != nil {
			for _, suffix := range moved {
				err = errors.Join(err, os.Rename(filepath.Join(recovery, filepath.Base(path)+suffix), path+suffix))
			}
		}
	}()
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if err = os.Rename(path+suffix, filepath.Join(recovery, filepath.Base(path)+suffix)); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return recovery, err
		}
		moved = append(moved, suffix)
	}
	err = os.Rename(candidate, path)
	return recovery, err
}

func checkRestore(ctx context.Context, path string) error {
	u := url.URL{Scheme: "file", Path: path, RawQuery: "mode=rw"}
	d, err := sql.Open("sqlite", u.String())
	if err != nil {
		return err
	}
	defer d.Close()
	var result string
	if err := d.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&result); err != nil {
		return err
	}
	if result != "ok" {
		return fmt.Errorf("SQLite integrity check failed: %s", result)
	}
	var migrations int
	if err := d.QueryRowContext(ctx, `SELECT COUNT(*) FROM schema_migrations`).Scan(&migrations); err != nil {
		return err
	}
	if migrations == 0 {
		return errors.New("backup has no recorded migrations")
	}
	// The replacement must not depend on companion files left in the temporary directory.
	_, err = d.ExecContext(ctx, `PRAGMA journal_mode = DELETE`)
	return err
}

func copyDatabaseFile(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%s is not a regular file", source)
	}
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	syncErr := out.Sync()
	return errors.Join(copyErr, syncErr, out.Close())
}
