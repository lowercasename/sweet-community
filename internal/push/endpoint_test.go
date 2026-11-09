package push

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"sweet/internal/db"
	"sweet/internal/store"
)

// A subscription's endpoint must belong to a browser's push service.
// The server sends a request to every
// endpoint it stores, so any other address would let a user make the server
// send requests to hosts of their choice.
func TestAllowedEndpoint(t *testing.T) {
	for endpoint, want := range map[string]bool{
		"https://fcm.googleapis.com/fcm/send/abc":              true,
		"https://updates.push.services.mozilla.com/wpush/v2/x": true,
		"https://web.push.apple.com/QGx":                       true,
		"https://wns2-par02p.notify.windows.com/w/?token=x":    true,
		"http://fcm.googleapis.com/fcm/send/abc":               false,
		"https://fcm.googleapis.com:8443/fcm/send/abc":         false,
		"https://user@fcm.googleapis.com/fcm/send/abc":         false,
		"https://fcm.googleapis.com.evil.test/x":               false,
		"https://notify.windows.com.evil.test/x":               false,
		"https://192.168.1.1/admin":                            false,
		"https://localhost/x":                                  false,
		"not a url":                                            false,
	} {
		if got := AllowedEndpoint(endpoint); got != want {
			t.Errorf("AllowedEndpoint(%q) = %v, want %v", endpoint, got, want)
		}
	}
}

// A user keeps at most MaxSubscriptions devices. Subscribing another device
// deletes the oldest.
func TestSubscribeKeepsTheNewestSubscriptions(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "push.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	if err := db.Migrate(ctx, d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO users (id, username, created_at) VALUES ('u', 'kit', 0)`); err != nil {
		t.Fatal(err)
	}
	for i := 0; i <= MaxSubscriptions; i++ {
		sub := Subscription{Endpoint: fmt.Sprintf("https://fcm.googleapis.com/fcm/send/%d", i), P256dh: "p", Auth: "a"}
		if err := Subscribe(ctx, d, "u", sub, int64(i)); err != nil {
			t.Fatal(err)
		}
	}
	subs, err := store.New(d).ListPushSubscriptions(ctx, "u")
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != MaxSubscriptions {
		t.Fatalf("subscriptions: %d", len(subs))
	}
	for _, s := range subs {
		if s.Endpoint == "https://fcm.googleapis.com/fcm/send/0" {
			t.Fatal("the oldest subscription was kept")
		}
	}
}
