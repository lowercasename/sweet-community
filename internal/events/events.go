// Package events stores committed resource updates and serves them over SSE.
// In-process signals wake subscribers to read the database log.
package events

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
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

// Hub wakes connected SSE clients when the event log changes.
type Hub struct {
	db *sql.DB
	// Version identifies the running binary. The stream sends it first, so
	// a tab that loaded another version can reload.
	Version string
	mu      sync.Mutex
	subs    map[chan struct{}]struct{}
	streams map[string][]*context.CancelFunc // each user's open streams, the oldest first
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{db: db, subs: map[chan struct{}]struct{}{}, streams: map[string][]*context.CancelFunc{}}
}

// MaxStreams is the most event streams one user may have open at once, one for each tab and device. It limits the
// connections and memory that one account can hold on the server.
const MaxStreams = 20

// Join records a new stream for a user. end ends the stream. When the user already has MaxStreams open, Join ends
// the oldest. A phone that the system stops in the background can leave its stream open on the server for many
// minutes, so the oldest stream is the likeliest to be dead. The stream calls leave when it ends.
func (h *Hub) Join(user string, end context.CancelFunc) (leave func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	this := &end
	open := append(h.streams[user], this)
	if len(open) > MaxStreams {
		(*open[0])()
		open = open[1:]
	}
	h.streams[user] = open
	return func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		h.streams[user] = slices.DeleteFunc(h.streams[user], func(s *context.CancelFunc) bool { return s == this })
		if len(h.streams[user]) == 0 {
			delete(h.streams, user)
		}
	}
}

// Log appends an event inside the caller's write transaction. The returned
// seq is in commit order because it is assigned while the write lock is
// held. Callers must notify subscribers after Commit, not before. Log first deletes
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

// Key names the resource that an event describes, such as "post:<id>". A resource's event and its delete event share a
// key. A kind that describes no single resource, such as notification_delete, has no key, and its events are never
// replaced. The queries ForgetPostCommentEvents and ForgetGroupEvents spell the same keys in SQL.
func Key(kind string, raw []byte) string {
	var p struct {
		ID      string `json:"id"`
		GroupID string `json:"group_id"`
		PostID  string `json:"post_id"`
		UserID  string `json:"user_id"`
		Stream  string `json:"stream"`
		Kind    string `json:"kind"`
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
	case "my_settings":
		if p.UserID != "" {
			return kind + ":" + p.UserID
		}
	case "post_notification_preference":
		if p.UserID != "" && p.PostID != "" {
			return kind + ":" + p.UserID + ":" + p.PostID
		}
	case "room_notification_preference":
		if p.UserID != "" && p.GroupID != "" {
			return kind + ":" + p.UserID + ":" + p.GroupID
		}
	case "marker":
		if p.UserID == "" || p.Stream == "" {
			return ""
		}
		return "marker:" + p.UserID + ":" + p.Stream
	case "report", "report_delete":
		// One key per reported item, so the log keeps the item's newest entry or its closing.
		if p.Kind == "" || p.ID == "" {
			return ""
		}
		return "report:" + p.Kind + ":" + p.ID
	case "settings", "rules", "welcome":
		return kind
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

// Notify wakes subscribers after a transaction commits. Events are read from the database in sequence.
// One pending notification is enough because every subscriber reads until it has caught up.
func (h *Hub) Notify() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func (h *Hub) subscribe() chan struct{} {
	ch := make(chan struct{}, 1)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) unsubscribe(ch chan struct{}) {
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
var Heartbeat = 15 * time.Second

// Entry is an event to log. It holds a kind and its payload.
type Entry struct {
	Kind    string
	Payload any
}

// Serve reads committed events in sequence for live delivery and replay. The filter checks current permissions
// before each event. A filtered event still advances the cursor. Database errors end the stream so it can retry.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, filter func(Event) (Event, bool, error), allowed func() (bool, error)) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	ctx := r.Context()
	after, replay := int64(0), false
	if v := r.Header.Get("Last-Event-ID"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	} else if v := r.URL.Query().Get("since"); v != "" {
		after, _ = strconv.ParseInt(v, 10, 64)
		replay = true
	}
	if !replay {
		var err error
		after, err = store.New(h.db).LatestEventSequence(ctx)
		if err != nil {
			http.Error(w, "Cannot open the event stream", http.StatusServiceUnavailable)
			return
		}
	}
	// Read the cursor before subscribing, then catch up after subscribing. A commit between them is in the log.
	ch := h.subscribe()
	defer h.unsubscribe(ch)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n")
	if h.Version != "" {
		v, _ := json.Marshal(h.Version)
		fmt.Fprintf(w, "event: version\ndata: %s\n\n", v)
	}
	flusher.Flush()

	checkSession := func() bool {
		ok, err := allowed()
		if err != nil {
			return false
		}
		if !ok {
			fmt.Fprint(w, "event: signed_out\ndata: {}\n\n")
			flusher.Flush()
		}
		return ok
	}
	catchUp := func() bool {
		const batch = 1000
		for {
			if ctx.Err() != nil || !checkSession() {
				return false
			}
			rows, err := h.Since(ctx, after, batch)
			if err != nil {
				return false
			}
			for _, row := range rows {
				if ctx.Err() != nil || !checkSession() {
					return false
				}
				e, visible, err := filter(row)
				if err != nil {
					return false
				}
				if visible {
					_, err = fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", row.Seq, e.Kind, e.Payload)
				} else {
					_, err = fmt.Fprintf(w, "id: %d\n: skipped\n\n", row.Seq)
				}
				if err != nil {
					return false
				}
				after = row.Seq
			}
			flusher.Flush()
			if len(rows) < batch {
				return true
			}
		}
	}
	if !catchUp() {
		return
	}
	if replay {
		fmt.Fprint(w, ": caught up\n\n")
		flusher.Flush()
	}
	tick := time.NewTicker(Heartbeat)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ch:
			if !catchUp() {
				return
			}
		case <-tick.C:
			// A heartbeat also catches a commit whose caller never reached Notify.
			if !catchUp() {
				return
			}
			if _, err := fmt.Fprint(w, ": hb\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
