package events

import (
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// pausedWriter stops delivery after subscription while the test commits and signals events.
type pausedWriter struct {
	*httptest.ResponseRecorder
	ready  chan struct{}
	resume chan struct{}
	first  bool
	cancel context.CancelFunc
}

func (w *pausedWriter) Flush() {
	if !w.first {
		w.first = true
		close(w.ready)
		<-w.resume
	}
	if strings.Contains(w.Body.String(), "event: done") || strings.Contains(w.Body.String(), ": caught up") {
		w.cancel()
	}
}

func TestDeliveryReadsCommittedEventsDespiteDelayedOrCombinedSignals(t *testing.T) {
	for _, count := range []int{2, 100} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			d := openLog(t)
			h := NewHub(d)
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			w := &pausedWriter{ResponseRecorder: httptest.NewRecorder(), ready: make(chan struct{}), resume: make(chan struct{}), cancel: cancel}
			done := make(chan struct{})
			go func() {
				defer close(done)
				h.Serve(w, httptest.NewRequest("GET", "/", nil).WithContext(ctx), func(e Event) (Event, bool, error) { return e, true, nil }, func() (bool, error) { return true, nil })
			}()
			<-w.ready
			for i := 1; i <= count; i++ {
				logged(t, d, "post", map[string]string{"id": fmt.Sprint(i)}, 1)
			}
			logged(t, d, "done", map[string]string{}, 1)
			// Signals can be delayed or combined while the connection is busy.
			for i := 0; i <= count; i++ {
				h.Notify()
			}
			close(w.resume)
			<-done
			body := w.Body.String()
			if got := strings.Count(body, "event: post\n"); got != count {
				t.Fatalf("delivered %d of %d committed posts", got, count)
			}
			if strings.Index(body, "id: 1\n") > strings.Index(body, fmt.Sprintf("id: %d\n", count)) {
				t.Fatal("events arrived out of commit order")
			}
		})
	}
}

func TestReplayPagesThroughTheWholeLog(t *testing.T) {
	d := openLog(t)
	h := NewHub(d)
	for i := 0; i < 1001; i++ {
		logged(t, d, "post", map[string]string{"id": fmt.Sprint(i)}, 1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resume := make(chan struct{})
	close(resume)
	w := &pausedWriter{ResponseRecorder: httptest.NewRecorder(), ready: make(chan struct{}), resume: resume, cancel: cancel}
	h.Serve(w, httptest.NewRequest("GET", "/?since=0", nil).WithContext(ctx), func(e Event) (Event, bool, error) { return e, true, nil }, func() (bool, error) { return true, nil })
	if got := strings.Count(w.Body.String(), "event: post\n"); got != 1001 {
		t.Fatalf("replayed %d of 1001 posts", got)
	}
}

func TestReplayChecksSessionBeforeEveryEvent(t *testing.T) {
	d := openLog(t)
	for i := 0; i < 3; i++ {
		logged(t, d, "post", map[string]string{"id": fmt.Sprint(i)}, 1)
	}
	h := NewHub(d)
	sent := 0
	w := httptest.NewRecorder()
	h.Serve(w, httptest.NewRequest("GET", "/?since=0", nil), func(e Event) (Event, bool, error) { sent++; return e, true, nil }, func() (bool, error) { return sent == 0, nil })
	if sent != 1 || !strings.Contains(w.Body.String(), "event: signed_out") {
		t.Fatalf("replay delivered %d events before closing", sent)
	}
}

func TestPermissionLookupFailureEndsReplayWithoutDisclosure(t *testing.T) {
	d := openLog(t)
	logged(t, d, "post", map[string]string{"id": "private"}, 1)
	h := NewHub(d)
	for _, sessionFailure := range []bool{false, true} {
		w := httptest.NewRecorder()
		failure := errors.New("database unavailable")
		h.Serve(w, httptest.NewRequest("GET", "/?since=0", nil), func(e Event) (Event, bool, error) { return e, false, failure }, func() (bool, error) {
			if sessionFailure {
				return false, failure
			}
			return true, nil
		})
		if strings.Contains(w.Body.String(), "event:") {
			t.Fatal("lookup failure disclosed data or signed the user out")
		}
	}
}
