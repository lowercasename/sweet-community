package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Notification is one thing done to one person (architecture.md,
// Notifications): a comment on their post, being added to a room. Written in
// the same transaction as the thing, by the handler that writes it, and told
// to that person alone. Whether it is read is the person's marker on the
// notifications stream, not a flag on the row.
type Notification struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Kind   string `json:"kind"`
	Actor  User   `json:"actor"`
	// GroupID is where it happened; PostID the post, for a comment.
	GroupID   string  `json:"group_id"`
	PostID    *string `json:"post_id"`
	CreatedAt int64   `json:"created_at"`
}

const (
	NotifyComment = "comment"
	NotifyAdded   = "added"
)

// Marker is how far along a stream a person has read: the newest time they
// have seen. One per person per stream, forward only, theirs alone.
type Marker struct {
	UserID string `json:"user_id"`
	Stream string `json:"stream"`
	ReadAt int64  `json:"read_at"`
	// Unread is how much of the stream is newer than ReadAt: others' live
	// messages in a chat, notifications on that stream. The server's count.
	Unread int64 `json:"unread"`
}

// The streams a marker can be on.
const (
	StreamNotifications = "notifications"
	streamChatPrefix    = "chat:"
	streamFeedPrefix    = "feed:"
)

// notify writes one notification inside the caller's transaction and returns
// its event. Nobody is told about their own doing: to == actor is no row.
func notify(r *http.Request, qtx *store.Queries, kind, to, actor, groupID string, postID *string, now int64) (*events.Entry, error) {
	if to == actor {
		return nil, nil
	}
	id, err := uuid.NewV7()
	if err != nil {
		return nil, err
	}
	pid := sql.NullString{}
	if postID != nil {
		pid = sql.NullString{String: *postID, Valid: true}
	}
	if err := qtx.CreateNotification(r.Context(), store.CreateNotificationParams{
		ID: id.String(), UserID: to, Kind: kind, ActorID: actor, GroupID: groupID, PostID: pid, CreatedAt: now,
	}); err != nil {
		return nil, err
	}
	row, err := qtx.GetNotification(r.Context(), id.String())
	if err != nil {
		return nil, err
	}
	return &events.Entry{Kind: "notification", Payload: wireNotification(row)}, nil
}

// listNotifications is mine, newest first, paged like the feed.
func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	before, limit := pageParams(r, 30, 100)
	rows, err := s.q().ListNotifications(r.Context(), store.ListNotificationsParams{UserID: me.ID, Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Notification, 0, len(rows))
	for _, row := range rows {
		out = append(out, wireNotification(store.GetNotificationRow(row)))
	}
	var next *int64
	if len(out) > limit {
		out = out[:limit]
		n := out[len(out)-1].CreatedAt
		next = &n
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": out, "next_before": next})
}

// Cleared says which of my notifications are gone: every one up to Before.
type Cleared struct {
	UserID string `json:"user_id"`
	Before int64  `json:"before"`
}

// clearNotifications deletes the ones I have seen, up to ?before= and never
// past my marker, for good (architecture.md, Notifications). One event
// names the set rather than each row.
func (s *Server) clearNotifications(w http.ResponseWriter, r *http.Request) {
	before, err := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	if err != nil || before <= 0 {
		writeErr(w, http.StatusBadRequest, "before is a time")
		return
	}
	me, _ := userFrom(r.Context())
	s.logged(w, r, "notification_delete", db.Now(), func(qtx *store.Queries) (any, int, error) {
		m, err := qtx.GetNotificationsMarker(r.Context(), me.ID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if before > m.ReadAt {
			before = m.ReadAt
		}
		if err := qtx.DeleteReadNotifications(r.Context(), store.DeleteReadNotificationsParams{UserID: me.ID, Before: before}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return &Cleared{UserID: me.ID, Before: before}, http.StatusOK, nil
	})
}

// listMarkers is a row for every stream of mine, read or not, each with its unread count.
func (s *Server) listMarkers(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	rows, err := s.q().ListMarkers(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Marker, 0, len(rows))
	for _, row := range rows {
		out = append(out, wireMarker(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"markers": out})
}

// setMarker moves my marker on one stream forward to read_at (held to now,
// never backwards). The stream is `notifications`, or `chat:<group>` or
// `feed:<group>` for a group I am in; a group I am not in does not exist to me.
func (s *Server) setMarker(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ReadAt int64 `json:"read_at"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ReadAt <= 0 {
		writeErr(w, http.StatusBadRequest, "read_at is a time")
		return
	}
	stream := r.PathValue("stream")
	me, _ := userFrom(r.Context())
	now := db.Now()
	if in.ReadAt > now {
		in.ReadAt = now
	}
	s.logged(w, r, "marker", now, func(qtx *store.Queries) (any, int, error) {
		// The row re-read after the write, as its stream's query lists it.
		var reread func() (store.ListMarkersRow, error)
		switch {
		case stream == StreamNotifications:
			reread = func() (store.ListMarkersRow, error) {
				row, err := qtx.GetNotificationsMarker(r.Context(), me.ID)
				return store.ListMarkersRow(row), err
			}
		case strings.HasPrefix(stream, streamChatPrefix), strings.HasPrefix(stream, streamFeedPrefix):
			chat := strings.HasPrefix(stream, streamChatPrefix)
			gid := strings.TrimPrefix(strings.TrimPrefix(stream, streamChatPrefix), streamFeedPrefix)
			a, err := actorIn(r.Context(), qtx, me, gid)
			if err != nil {
				return nil, http.StatusInternalServerError, err
			}
			if !perm.CanSee(a) {
				return nil, http.StatusNotFound, errors.New("no such group")
			}
			reread = func() (store.ListMarkersRow, error) {
				if chat {
					row, err := qtx.GetChatMarker(r.Context(), store.GetChatMarkerParams{UserID: me.ID, GroupID: gid})
					return store.ListMarkersRow(row), err
				}
				row, err := qtx.GetFeedMarker(r.Context(), store.GetFeedMarkerParams{UserID: me.ID, GroupID: gid})
				return store.ListMarkersRow(row), err
			}
		default:
			return nil, http.StatusBadRequest, errors.New("no such stream")
		}
		if err := qtx.SetMarker(r.Context(), store.SetMarkerParams{UserID: me.ID, Stream: stream, ReadAt: in.ReadAt}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		row, err := reread()
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		m := wireMarker(row)
		return &m, http.StatusOK, nil
	})
}
