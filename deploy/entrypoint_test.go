package deploy

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestFailedRestorePreservesCurrentDatabase(t *testing.T) {
	for _, timestamp := range []string{"", "invalid-timestamp"} {
		t.Run("timestamp="+timestamp, func(t *testing.T) {
			dir := t.TempDir()
			for _, suffix := range []string{"", "-wal", "-shm"} {
				if err := os.WriteFile(filepath.Join(dir, "sweet.db"+suffix), []byte("original"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(dir, "litestream"), []byte("#!/bin/sh\nexit 1\n"), 0700); err != nil {
				t.Fatal(err)
			}
			cmd := exec.Command("sh", "entrypoint.sh", "restore", timestamp)
			cmd.Env = []string{"PATH=" + dir + ":" + os.Getenv("PATH"), "SWEET_DATA=" + dir,
				"SWEET_S3_BUCKET=test", "SWEET_S3_ENDPOINT=test.invalid",
				"SWEET_S3_ACCESS_KEY=test", "SWEET_S3_SECRET_KEY=test"}
			if output, err := cmd.CombinedOutput(); err == nil {
				t.Fatalf("failed download succeeded: %s", output)
			}
			for _, suffix := range []string{"", "-wal", "-shm"} {
				content, err := os.ReadFile(filepath.Join(dir, "sweet.db"+suffix))
				if err != nil || !bytes.Equal(content, []byte("original")) {
					t.Fatalf("original %q lost: %v", suffix, err)
				}
			}
		})
	}
}
