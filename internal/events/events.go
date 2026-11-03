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
)

// Event is one row of the event log.
type Event struct {
	Seq     int64           `json:"seq"`
	Kind    string          `json:"kind"`
	Payload json.RawMessage `json:"payload"`
}

// Hub fans events out to connected SSE clients.
type Hub struct {
	db   *sql.DB
	mu   sync.Mutex
	subs map[chan Event]struct{}
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
	res, err := tx.ExecContext(ctx, `INSERT INTO events (kind, payload, created_at) VALUES (?, ?, ?)`, kind, string(raw), now)
	if err != nil {
		return Event{}, err
	}
	seq, err := res.LastInsertId()
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
	rows, err := h.db.QueryContext(ctx, `SELECT seq, kind, payload FROM events WHERE seq > ? ORDER BY seq LIMIT ?`, after, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		var payload string
		if err := rows.Scan(&e.Seq, &e.Kind, &payload); err != nil {
			return nil, err
		}
		e.Payload = json.RawMessage(payload)
		out = append(out, e)
	}
	return out, rows.Err()
}

// Heartbeat is how often the server writes a comment line to keep the
// connection observably alive (proxies, Cloudflare's 125 s read timeout,
// and dead-client detection on our side).
const Heartbeat = 15 * time.Second

// ServeHTTP is the SSE endpoint. It replays from Last-Event-ID or ?since=,
// then goes live. Every event carries id: <seq>.
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	after := int64(0)
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
	} else if v := r.URL.Query().Get("since"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
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
	flusher.Flush()

	ctx := r.Context()
	write := func(e Event) {
		fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", e.Seq, e.Kind, e.Payload)
	}

	last := after
	if after > 0 {
		backlog, err := h.Since(ctx, after, 1000)
		if err == nil {
			for _, e := range backlog {
				write(e)
				last = e.Seq
			}
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
