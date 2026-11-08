package push

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"sweet/internal/db"
)

// The instance's VAPID keys are generated once and stored, so devices
// subscribed with them keep working across restarts.
func TestLoadKeysMakesThemOnceAndKeepsThem(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "push.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	if err := db.Migrate(ctx, d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	first, err := LoadKeys(ctx, d)
	if err != nil {
		t.Fatal(err)
	}
	if first.Public == "" || first.Private == "" || first.Public == first.Private {
		t.Fatalf("keys: %+v", first)
	}
	again, err := LoadKeys(ctx, d)
	if err != nil {
		t.Fatal(err)
	}
	if again != first {
		t.Fatalf("keys changed: %+v then %+v", first, again)
	}
}
