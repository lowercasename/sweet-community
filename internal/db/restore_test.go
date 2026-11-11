package db

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
)

func restoreFixture(t *testing.T, path string, value int) {
	t.Helper()
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if err := Migrate(context.Background(), d, fstest.MapFS{"001_a.sql": file(`CREATE TABLE a (value INTEGER);`)}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO a VALUES (?)`, value); err != nil {
		t.Fatal(err)
	}
}

func restoredValue(t *testing.T, path string) int {
	t.Helper()
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	var value int
	if err := d.QueryRow(`SELECT value FROM a`).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestRestoreRejectsInvalidReplacementWithoutChangingCurrentFiles(t *testing.T) {
	for _, kind := range []string{"missing", "empty", "corrupt", "unrelated database"} {
		t.Run(kind, func(t *testing.T) {
			dir := t.TempDir()
			path, source := filepath.Join(dir, "sweet.db"), filepath.Join(dir, "replacement.db")
			restoreFixture(t, path, 42)
			original := map[string][]byte{}
			for _, suffix := range []string{"", "-wal", "-shm"} {
				if suffix != "" {
					if err := os.WriteFile(path+suffix, []byte("preserve companion file"), 0600); err != nil {
						t.Fatal(err)
					}
				}
				original[suffix], _ = os.ReadFile(path + suffix)
			}
			switch kind {
			case "empty", "corrupt":
				var content []byte
				if kind == "corrupt" {
					content = []byte("not a database")
				}
				if err := os.WriteFile(source, content, 0600); err != nil {
					t.Fatal(err)
				}
			case "unrelated database":
				d, err := Open(source)
				if err != nil {
					t.Fatal(err)
				}
				_, err = d.Exec(`CREATE TABLE unrelated (id INTEGER)`)
				d.Close()
				if err != nil {
					t.Fatal(err)
				}
			}
			if _, err := Restore(context.Background(), path, source); err == nil {
				t.Fatal("invalid replacement accepted")
			}
			for suffix, before := range original {
				after, err := os.ReadFile(path + suffix)
				if err != nil || !bytes.Equal(before, after) {
					t.Fatalf("current file %q changed: %v", suffix, err)
				}
			}
		})
	}
}

func TestRestorePreservesUncheckpointedDatabaseAndDoesNotMigrateReplacement(t *testing.T) {
	dir := t.TempDir()
	path, source := filepath.Join(dir, "sweet.db"), filepath.Join(dir, "replacement.db")
	restoreFixture(t, source, 7)
	// Copy an open WAL database to simulate a server that stopped without checkpointing.
	live := filepath.Join(t.TempDir(), "live.db")
	restoreFixture(t, live, 42)
	d, err := Open(live, LitestreamOwnsCheckpoints)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := d.Exec(`UPDATE a SET value = 43`); err != nil {
		t.Fatal(err)
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		content, err := os.ReadFile(live + suffix)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path+suffix, content, 0600); err != nil {
			t.Fatal(err)
		}
	}
	backup, err := Restore(context.Background(), path, source)
	if err != nil {
		t.Fatal(err)
	}
	if got := restoredValue(t, path); got != 7 {
		t.Fatalf("restored value = %d, want 7", got)
	}
	if got := restoredValue(t, filepath.Join(backup, "sweet.db")); got != 43 {
		t.Fatalf("recovery value = %d, want uncheckpointed value 43", got)
	}
	if got := restoredValue(t, source); got != 7 {
		t.Fatalf("source changed to %d", got)
	}
	// A second restore must not overwrite the first recovery copy.
	second, err := Restore(context.Background(), path, source)
	if err != nil || second == backup {
		t.Fatalf("second recovery directory = %q, error = %v", second, err)
	}
	if got := restoredValue(t, filepath.Join(backup, "sweet.db")); got != 43 {
		t.Fatalf("previous recovery copy changed to %d", got)
	}
}

func TestRestoreCanReplaceCorruptDatabase(t *testing.T) {
	dir := t.TempDir()
	path, source := filepath.Join(dir, "sweet.db"), filepath.Join(dir, "replacement.db")
	restoreFixture(t, source, 7)
	if err := os.WriteFile(path, []byte("damaged original"), 0600); err != nil {
		t.Fatal(err)
	}
	backup, err := Restore(context.Background(), path, source)
	if err != nil {
		t.Fatal(err)
	}
	if got := restoredValue(t, path); got != 7 {
		t.Fatalf("restored value = %d, want 7", got)
	}
	content, err := os.ReadFile(filepath.Join(backup, "sweet.db"))
	if err != nil || string(content) != "damaged original" {
		t.Fatalf("damaged original not preserved: %v", err)
	}
}

func TestRestoreCopyFailurePreservesCurrentFiles(t *testing.T) {
	dir := t.TempDir()
	path, source := filepath.Join(dir, "sweet.db"), filepath.Join(dir, "replacement.db")
	restoreFixture(t, path, 42)
	restoreFixture(t, source, 7)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+"-wal", []byte("preserve WAL"), 0600); err != nil {
		t.Fatal(err)
	}
	// A directory cannot be copied as a SQLite companion file.
	if err := os.Mkdir(path+"-shm", 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := Restore(context.Background(), path, source); err == nil {
		t.Fatal("restore continued after a recovery copy failed")
	}
	after, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(before, after) {
		t.Fatalf("current database changed: %v", err)
	}
	wal, err := os.ReadFile(path + "-wal")
	if err != nil || string(wal) != "preserve WAL" {
		t.Fatalf("current WAL changed: %v", err)
	}
}
