package events

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The stream's first event names the binary's version, so a tab that
// loaded another version can reload (architecture.md, Updates: Clients).
// It carries no id: it is not part of the log.
func TestServeAnnouncesTheVersionFirst(t *testing.T) {
	h := NewHub(nil)
	h.Version = "abc123"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.Serve(w, r, func(e Event) (Event, bool) { return e, true })
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
