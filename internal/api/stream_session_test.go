package api

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

// liveStream opens the client's event stream from now on. It returns a channel of the kinds of the events the stream
// sends, in order. The channel closes when the server ends the stream.
func (c *client) liveStream() <-chan string {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	c.t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, "GET", c.base+"/api/events", nil)
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		c.t.Fatalf("stream: %d", res.StatusCode)
	}
	kinds := make(chan string, 64)
	go func() {
		defer close(kinds)
		defer res.Body.Close()
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			if line := sc.Text(); strings.HasPrefix(line, "event: ") {
				kinds <- strings.TrimPrefix(line, "event: ")
			}
		}
	}()
	return kinds
}

// all reads the stream's event kinds until the server ends the stream.
func all(t *testing.T, kinds <-chan string) []string {
	t.Helper()
	var got []string
	timeout := time.After(5 * time.Second)
	for {
		select {
		case k, ok := <-kinds:
			if !ok {
				return got
			}
			got = append(got, k)
		case <-timeout:
			t.Fatalf("the stream did not end. Events so far: %v", got)
		}
	}
}

// An open event stream ends when its session ends. Before the stream sends an event, it checks that its session still
// exists. When the session has gone, the stream sends signed_out, so the page can sign out, and then ends. The event
// that was due is not sent. Signing out, signing out everywhere and removal from the community all end sessions.
func TestStreamEndsWhenItsSessionEnds(t *testing.T) {
	ts, owner := newTestServer(t)
	message := func(c *client) {
		c.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	}

	// Signing out on this device.
	kit, _ := registerMember(t, ts, owner, "kit")
	stream := kit.liveStream()
	kit.mustStatus(204, "POST", "/api/logout", nil)
	message(owner)
	if got := all(t, stream); len(got) != 1 || got[0] != "signed_out" {
		t.Fatalf("after signing out: %v", got)
	}

	// Signing out everywhere, from another device.
	mo, _ := registerMember(t, ts, owner, "mo")
	stream = owner.liveStream()
	elsewhere := newClient(t, ts)
	elsewhere.login("raphael", "correct horse")
	elsewhere.mustStatus(204, "POST", "/api/logout-all", nil)
	message(mo)
	if got := all(t, stream); len(got) != 1 || got[0] != "signed_out" {
		t.Fatalf("after signing out everywhere: %v", got)
	}

	// Removal from the community. The removal's own events are the first that the stream checks.
	owner = newClient(t, ts)
	owner.login("raphael", "correct horse")
	sam, samID := registerMember(t, ts, owner, "sam")
	stream = sam.liveStream()
	owner.mustStatus(204, "DELETE", "/api/users/"+samID, nil)
	if got := all(t, stream); len(got) != 1 || got[0] != "signed_out" {
		t.Fatalf("after removal: %v", got)
	}
}
