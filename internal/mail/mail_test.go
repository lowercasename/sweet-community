package mail

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDirWritesOneFilePerMessage(t *testing.T) {
	d := Dir{Path: filepath.Join(t.TempDir(), "mail")}
	if err := d.Send(context.Background(), Message{To: "kit@example.test", Subject: "Hello", Text: "A link: https://x.test/verify/abc"}); err != nil {
		t.Fatal(err)
	}
	files, _ := os.ReadDir(d.Path)
	if len(files) != 1 || !strings.Contains(files[0].Name(), "kit_at_example.test") {
		t.Fatalf("files: %v", files)
	}
	body, _ := os.ReadFile(filepath.Join(d.Path, files[0].Name()))
	if !strings.HasPrefix(string(body), "To: kit@example.test\nSubject: Hello\n\nA link:") {
		t.Fatalf("body: %q", body)
	}
}
