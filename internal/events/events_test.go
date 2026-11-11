package events

import (
	"bufio"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// The stream's first event is the binary's version, so a tab that loaded
// another version can reload. The event
// has no id because it is not part of the log.
func TestServeAnnouncesTheVersionFirst(t *testing.T) {
	d := openLog(t)
	h := NewHub(d)
	h.Version = "abc123"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.Serve(w, r, func(e Event) (Event, bool, error) { return e, true, nil }, func() (bool, error) { return true, nil })
	}))
	defer srv.Close()

	res, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	want := []string{": connected", "", "event: version", `data: "abc123"`, ""}
	r := bufio.NewReader(res.Body)
	for _, w := range want {
		line, err := r.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		if got := line[:len(line)-1]; got != w {
			t.Fatalf("line %q, want %q", got, w)
		}
	}
}

// A stream ends when its viewer may no longer receive events, such as after signing out. The stream checks before it
// sends each event and at each heartbeat, so a quiet stream ends too. Its last event is signed_out.
func TestServeEndsWhenTheViewerMayNoLongerReceive(t *testing.T) {
	saved := Heartbeat
	Heartbeat = 50 * time.Millisecond
	defer func() { Heartbeat = saved }()

	for _, quiet := range []bool{false, true} {
		d := openLog(t)
		h := NewHub(d)
		var allowed atomic.Bool
		allowed.Store(true)
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h.Serve(w, r, func(e Event) (Event, bool, error) { return e, true, nil }, func() (bool, error) { return allowed.Load(), nil })
		}))
		res, err := http.Get(srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		// One event while allowed, then one after the viewer has signed out, unless the stream is quiet.
		logged(t, d, "message", map[string]string{"id": "first"}, 1)
		h.Notify()
		reader := bufio.NewReader(res.Body)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				t.Fatal(err)
			}
			if line == "event: message\n" {
				break
			}
		}
		allowed.Store(false)
		if !quiet {
			logged(t, d, "message", map[string]string{"id": "second"}, 1)
			h.Notify()
		}
		body, err := io.ReadAll(reader)
		res.Body.Close()
		srv.Close()
		if err != nil {
			t.Fatal(err)
		}
		kinds := []string{"message"}
		for _, line := range strings.Split(string(body), "\n") {
			if strings.HasPrefix(line, "event: ") {
				kinds = append(kinds, strings.TrimPrefix(line, "event: "))
			}
		}
		if strings.Join(kinds, ",") != "message,signed_out" {
			t.Fatalf("quiet %v: events %v", quiet, kinds)
		}
	}
}
