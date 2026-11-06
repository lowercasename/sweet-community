// Package events is the instance's event log and in-process pub/sub, and the
// SSE handler that serves it. One process per instance, so a map of channels
// is the whole broker.
package events

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"sweet/internal/store"
)

// Event is one row of the event log.
type Event struct {
	Seq     int64           `json:"seq"`
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
}

// Hub fans events out to connected SSE clients.
type Hub struct {
	db *sql.DB
	// Version names the running binary; the stream announces it first, so
	// a tab that loaded another version can reload (architecture.md, Updates).
	Version string
	mu      sync.Mutex
	subs    map[chan Event]struct{}
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{db: db, subs: map[chan Event]struct{}{}}
}

// Log appends an event inside the caller's write transaction. The seq it
// returns is commit-ordered because it is assigned while the write lock is
// held. Callers broadcast after Commit, not before.
func Log(ctx context.Context, tx *sql.Tx, kind string, payload any, now int64) (Event, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Event{}, err
	}
	seq, err := store.New(tx).InsertEvent(ctx, store.InsertEventParams{Kind: kind, Payload: string(raw), CreatedAt: now})
	if err != nil {
		return Event{}, err
	}
	return Event{Seq: seq, Kind: kind, Payload: raw}, nil
}

// Broadcast delivers a committed event to every live subscriber. Slow
// subscribers are skipped rather than blocking the writer; they catch up
// from the log on their next reconnect.
func (h *Hub) Broadcast(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default:
		}
	}
}

func (h *Hub) subscribe() chan Event {
	ch := make(chan Event, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) unsubscribe(ch chan Event) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

// Since returns events with seq > after, oldest first.
func (h *Hub) Since(ctx context.Context, after int64, limit int) ([]Event, error) {
	rows, err := store.New(h.db).ListEventsSince(ctx, store.ListEventsSinceParams{After: after, PageSize: int64(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]Event, 0, len(rows))
	for _, row := range rows {
		out = append(out, Event{Seq: row.Seq, Kind: row.Kind, Payload: json.RawMessage(row.Payload)})
	}
	return out, nil
}

// Heartbeat is how often the server writes a comment line to keep the
// connection observably alive (proxies, Cloudflare's 125 s read timeout,
// and dead-client detection on our side).
const Heartbeat = 15 * time.Second

// Entry is an event to log: a kind and its payload.
type Entry struct {
	Kind    string
	Payload any
}

// Serve is the SSE endpoint. It replays from Last-Event-ID or ?since=, then
// goes live. Every event carries id: <seq>. filter runs on each event before
// it is written: the log holds every event once, as it is; each connection
// decides whether its viewer may have it and adds their own view (can
// flags). A dropped event still advances the viewer's sequence.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, filter func(Event) (Event, bool)) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	// A client that names a sequence, even 0, wants everything after it; one
	// that names none has just loaded the page from the API and wants only
	// what happens next.
	after, replay := int64(0), false
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	} else if v := r.URL.Query().Get("since"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	}

	// Subscribe before replaying so nothing committed during the replay is
	// missed; duplicates are filtered by seq below.
	ch := h.subscribe()
	defer h.unsubscribe(ch)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	if h.Version != "" {
		// No id: it is not part of the log, and must not move Last-Event-ID.
		v, _ := json.Marshal(h.Version)
		fmt.Fprintf(w, "event: version\ndata: %s\n\n", v)
	}
	flusher.Flush()

	ctx := r.Context()
	write := func(e Event) {
		e, ok := filter(e)
		if !ok {
			// A comment line carrying the id keeps Last-Event-ID moving.
			fmt.Fprintf(w, "id: %d\n: skipped\n\n", e.Seq)
			return
		}
		fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", e.Seq, e.Kind, e.Payload)
	}

	last := after
	if replay {
		backlog, err := h.Since(ctx, after, 1000)
		if err == nil {
			for _, e := range backlog {
				write(e)
				last = e.Seq
			}
			// A comment marks the end of the replay, so a reader that wants
			// only the backlog knows when it has it.
			fmt.Fprint(w, ": caught up\n\n")
			flusher.Flush()
		}
	}

	tick := time.NewTicker(Heartbeat)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case e := <-ch:
			if e.Seq <= last {
				continue
			}
			write(e)
			last = e.Seq
			flusher.Flush()
		case <-tick.C:
			if _, err := fmt.Fprint(w, ": hb\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
