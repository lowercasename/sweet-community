package api

import (
	"context"
	"net/http"
	"testing"
	"time"

	"sweet/internal/events"
)

// A user has at most events.MaxStreams event streams open at once. A further one is refused until one of them closes.
// Another user is not affected.
func TestEventStreamsPerUserAreLimited(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	// open opens a stream and returns its status and a function that closes it.
	open := func(c *client) (int, func()) {
		t.Helper()
		ctx, cancel := context.WithCancel(context.Background())
		req, _ := http.NewRequestWithContext(ctx, "GET", c.base+"/api/events", nil)
		res, err := c.http.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		stop := func() {
			cancel()
			res.Body.Close()
		}
		t.Cleanup(stop)
		return res.StatusCode, stop
	}
	var first func()
	for i := range events.MaxStreams {
		status, stop := open(owner)
		if status != http.StatusOK {
			t.Fatalf("stream %d: %d", i+1, status)
		}
		if i == 0 {
			first = stop
		}
	}
	if status, _ := open(owner); status != http.StatusTooManyRequests {
		t.Fatalf("one stream more than the limit: %d, want 429", status)
	}
	if status, _ := open(kit); status != http.StatusOK {
		t.Fatalf("another user's stream: %d", status)
	}
	// The server counts a stream as closed once its request has ended.
	first()
	deadline := time.Now().Add(5 * time.Second)
	for {
		status, stop := open(owner)
		stop()
		if status == http.StatusOK {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("a stream after one was closed: %d", status)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
