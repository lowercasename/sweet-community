package push

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	webpush "github.com/SherClockHolmes/webpush-go"

	"sweet/internal/db"
)

func TestWebPushFitsMobilePayloadLimit(t *testing.T) {
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		if len(data) > 2048 {
			t.Logf("encrypted push is %d bytes", len(data))
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer service.Close()
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		t.Fatal(err)
	}
	sender := WebPush{Keys: Keys{Public: public, Private: private}, Subscriber: "https://sweet.test"}
	sub := Subscription{Endpoint: service.URL, P256dh: public, Auth: base64.RawURLEncoding.EncodeToString(make([]byte, 16))}
	for _, title := range []string{"Sweet", strings.Repeat("🌻", 100)} {
		data, err := json.Marshal(Payload{Title: title, Body: "Someone replied to your message", URL: "https://sweet.test/"})
		if err != nil {
			t.Fatal(err)
		}
		if gone, err := sender.Send(context.Background(), sub, data); gone || err != nil {
			t.Fatalf("mobile delivery: gone=%v, err=%v", gone, err)
		}
	}
}

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
