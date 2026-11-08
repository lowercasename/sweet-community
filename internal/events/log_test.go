package events

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/store"
)

func openLog(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "events.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.Migrate(context.Background(), d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	return d
}

// logged writes one event in its own transaction.
func logged(t *testing.T, d *sql.DB, kind string, payload any, at int64) {
	t.Helper()
	tx, err := d.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := Log(context.Background(), tx, kind, payload, at); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

func kinds(t *testing.T, d *sql.DB) []string {
	t.Helper()
	rows, err := store.New(d).ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for _, r := range rows {
		out = append(out, r.Kind+" "+r.Payload)
	}
	return out
}

// The log keeps only the newest event for each resource (architecture.md,
// Realtime). A delete event replaces the resource's last event, and an event
// without a key is kept.
func TestLogKeepsTheNewestEventForEachResource(t *testing.T) {
	d := openLog(t)
	now := time.Now().UnixMilli()
	logged(t, d, "post", map[string]string{"id": "p1", "body_html": "v1"}, now)
	logged(t, d, "post", map[string]string{"id": "p2", "body_html": "other"}, now)
	logged(t, d, "post", map[string]string{"id": "p1", "body_html": "v2"}, now)
	logged(t, d, "post_delete", map[string]string{"id": "p2", "group_id": "g"}, now)
	logged(t, d, "notification_delete", map[string]any{"user_id": "u", "before": 1}, now)
	got := kinds(t, d)
	want := []string{
		`post {"body_html":"v2","id":"p1"}`,
		`post_delete {"group_id":"g","id":"p2"}`,
		`notification_delete {"before":1,"user_id":"u"}`,
	}
	if len(got) != len(want) {
		t.Fatalf("log: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("log: %v", got)
		}
	}
}

func TestKeyNamesTheResource(t *testing.T) {
	for _, c := range []struct{ kind, payload, want string }{
		{"post", `{"id":"p"}`, "post:p"},
		{"post_delete", `{"id":"p","group_id":"g"}`, "post:p"},
		{"comment_delete", `{"id":"c","post_id":"p"}`, "comment:c"},
		{"message", `{"id":"m"}`, "message:m"},
		{"group_delete", `{"id":"g"}`, "group:g"},
		{"topic", `{"id":"t"}`, "topic:t"},
		{"user", `{"id":"u"}`, "user:u"},
		{"profile", `{"id":"u","bio_html":""}`, "profile:u"},
		{"notification", `{"id":"n"}`, "notification:n"},
		{"membership", `{"group_id":"g","user":{"id":"u"}}`, "membership:g:u"},
		{"membership_delete", `{"group_id":"g","user_id":"u"}`, "membership:g:u"},
		{"marker", `{"user_id":"u","stream":"chat:g"}`, "marker:u:chat:g"},
		{"settings", `{"name":"x"}`, "settings"},
		{"notification_delete", `{"user_id":"u","before":1}`, ""},
		{"post", `{}`, ""},
	} {
		if got := Key(c.kind, []byte(c.payload)); got != c.want {
			t.Errorf("Key(%s, %s) = %q, want %q", c.kind, c.payload, got, c.want)
		}
	}
}

// Prune deletes the events older than the window and keeps the rest.
func TestPruneDeletesEventsOlderThanTheWindow(t *testing.T) {
	d := openLog(t)
	now := time.Now().UnixMilli()
	logged(t, d, "post", map[string]string{"id": "old"}, now-Window.Milliseconds()-1)
	logged(t, d, "post", map[string]string{"id": "new"}, now-Window.Milliseconds()+60_000)
	if err := Prune(context.Background(), d, now); err != nil {
		t.Fatal(err)
	}
	if got := kinds(t, d); len(got) != 1 || got[0] != `post {"id":"new"}` {
		t.Fatalf("log after prune: %v", got)
	}
}
