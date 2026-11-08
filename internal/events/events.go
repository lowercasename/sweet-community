// Package events holds the instance's event log, the in-process pub/sub, and
// the SSE handler that serves them. There is one process per instance, so a
// map of channels is sufficient as the broker.
package events

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	// Version identifies the running binary. The stream sends it first, so
	// a tab that loaded another version can reload (architecture.md, Updates).
	Version string
	mu      sync.Mutex
	subs    map[chan Event]struct{}
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{db: db, subs: map[chan Event]struct{}{}}
}

// Log appends an event inside the caller's write transaction. The returned
// seq is in commit order because it is assigned while the write lock is
// held. Callers must broadcast after Commit, not before. Log first deletes
// the earlier events about the same resource, so the log keeps only the
// newest event for each key.
func Log(ctx context.Context, tx *sql.Tx, kind string, payload any, now int64) (Event, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return Event{}, err
	}
	q := store.New(tx)
	key := Key(kind, raw)
	if key != "" {
		if err := q.DeleteEventsByKey(ctx, sql.NullString{String: key, Valid: true}); err != nil {
			return Event{}, err
		}
	}
	seq, err := q.InsertEvent(ctx, store.InsertEventParams{Kind: kind, Payload: string(raw), Key: sql.NullString{String: key, Valid: key != ""}, CreatedAt: now})
	if err != nil {
		return Event{}, err
	}
	return Event{Seq: seq, Kind: kind, Payload: raw}, nil
}

// Key names the resource that an event describes, such as "post:<id>"
// (architecture.md, Realtime). A resource's event and its delete event share
// a key. A kind that describes no single resource, such as
// notification_delete, has no key, and its events are never replaced.
func Key(kind string, raw []byte) string {
	var p struct {
		ID      string `json:"id"`
		GroupID string `json:"group_id"`
		UserID  string `json:"user_id"`
		Stream  string `json:"stream"`
		User    struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return ""
	}
	switch kind {
	case "post", "post_delete", "comment", "comment_delete", "message", "message_delete", "group", "group_delete", "topic", "topic_delete":
		if p.ID == "" {
			return ""
		}
		return strings.TrimSuffix(kind, "_delete") + ":" + p.ID
	case "user", "profile", "notification":
		if p.ID == "" {
			return ""
		}
		return kind + ":" + p.ID
	case "membership", "membership_delete":
		// A membership event carries the user, and a membership_delete event carries the user's id.
		uid := p.UserID
		if uid == "" {
			uid = p.User.ID
		}
		if p.GroupID == "" || uid == "" {
			return ""
		}
		return "membership:" + p.GroupID + ":" + uid
	case "marker":
		if p.UserID == "" || p.Stream == "" {
			return ""
		}
		return "marker:" + p.UserID + ":" + p.Stream
	case "settings":
		return "settings"
	}
	return ""
}

// Forget deletes every logged event with one of the keys. A handler calls it
// for resources that are deleted with another one and get no delete event of
// their own, such as the comments of a deleted post.
func Forget(ctx context.Context, q *store.Queries, keys ...string) error {
	for _, k := range keys {
		if err := q.DeleteEventsByKey(ctx, sql.NullString{String: k, Valid: true}); err != nil {
			return err
		}
	}
	return nil
}

// Window is how long the log keeps an event. A client that reconnects after a
// longer absence receives only the events in the window, and refetches its
// data as every reconnecting client does. The window also limits how long an
// author's earlier name stays in the log inside older payloads.
const Window = 24 * time.Hour

// Prune deletes the events written more than Window before now, a time in
// Unix milliseconds.
func Prune(ctx context.Context, db *sql.DB, now int64) error {
	return store.New(db).DeleteEventsBefore(ctx, now-Window.Milliseconds())
}

// PruneEvery calls Prune once at start and then at each interval, until ctx
// ends.
func PruneEvery(ctx context.Context, db *sql.DB, every time.Duration, logf func(string, ...any)) {
	prune := func() {
		if err := Prune(ctx, db, time.Now().UnixMilli()); err != nil && ctx.Err() == nil {
			logf("events: prune: %v", err)
		}
	}
	prune()
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			prune()
		}
	}
}

// Broadcast delivers a committed event to every connected subscriber. A
// subscriber whose channel is full is skipped rather than blocking the
// writer. It catches up from the log on its next reconnect.
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

// Heartbeat is the interval at which the server writes a comment line. The
// line keeps the connection alive through proxies and Cloudflare's 125 s read
// timeout, and lets the server detect a disconnected client.
const Heartbeat = 15 * time.Second

// Entry is an event to log. It holds a kind and its payload.
type Entry struct {
	Kind    string
	Payload any
}

// Serve is the SSE endpoint. It replays events after Last-Event-ID or
// ?since=, then streams live events. Every event carries id: <seq>. filter
// runs on each event before it is written. The log holds every event once,
// unfiltered. Each connection decides whether its viewer may receive the
// event and adds the viewer's own view, such as can flags. A filtered-out
// event still advances the viewer's sequence.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, filter func(Event) (Event, bool)) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	// A client that sends a sequence, including 0, wants every event after
	// it. A client that sends none has just loaded the page from the API and
	// wants only events from now on.
	after, replay := int64(0), false
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	} else if v := r.URL.Query().Get("since"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	}

	// Subscribe before replaying so that no event committed during the replay
	// is missed. Duplicates are filtered by seq below.
	ch := h.subscribe()
	defer h.unsubscribe(ch)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	if h.Version != "" {
		// The version event has no id. It is not part of the log and must not
		// change Last-Event-ID.
		v, _ := json.Marshal(h.Version)
		fmt.Fprintf(w, "event: version\ndata: %s\n\n", v)
	}
	flusher.Flush()

	ctx := r.Context()
	write := func(e Event) {
		e, ok := filter(e)
		if !ok {
			// A comment line with the id advances Last-Event-ID.
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
			// A comment line marks the end of the replay, so a reader that
			// wants only the backlog knows when it has received all of it.
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
