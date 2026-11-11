package api

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"

	"sweet/internal/events"
)

// A user has at most events.MaxStreams event streams open at once. A new stream beyond that is accepted, and the
// user's oldest stream ends, so a stream that a phone left open in the background cannot lock the user out.
func TestANewStreamEndsTheOldestBeyondTheLimit(t *testing.T) {
	_, owner := newTestServer(t)
	// open opens a stream and returns its status and its body.
	open := func() (int, io.ReadCloser) {
		t.Helper()
		ctx, cancel := context.WithCancel(context.Background())
		t.Cleanup(cancel)
		req, _ := http.NewRequestWithContext(ctx, "GET", owner.base+"/api/events", nil)
		res, err := owner.http.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { res.Body.Close() })
		return res.StatusCode, res.Body
	}
	_, oldest := open()
	ended := make(chan struct{})
	go func() {
		io.Copy(io.Discard, oldest)
		close(ended)
	}()
	for i := 1; i < events.MaxStreams; i++ {
		if status, _ := open(); status != http.StatusOK {
			t.Fatalf("stream %d: %d", i+1, status)
		}
	}
	select {
	case <-ended:
		t.Fatal("the oldest stream ended before the limit was passed")
	default:
	}
	if status, _ := open(); status != http.StatusOK {
		t.Fatalf("one stream more than the limit: %d, want 200", status)
	}
	select {
	case <-ended:
	case <-time.After(5 * time.Second):
		t.Fatal("the oldest stream did not end when the limit was passed")
	}
}
