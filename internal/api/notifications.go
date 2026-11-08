package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Notification records one action that affects one user (architecture.md,
// Notifications), such as a comment on their post or being added to a room.
// The handler that writes the action writes the notification in the same
// transaction, and the notification is sent to that user only. A
// notification is marked read (read_at) when the user opens it, one at a
// time. Opening the notifications page does not mark anything read.
type Notification struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Kind   string `json:"kind"`
	Actor  User   `json:"actor"`
	// GroupID is the group the action happened in. PostID is the post, for a comment.
	GroupID string  `json:"group_id"`
	PostID  *string `json:"post_id"`
	// TopicID is the topic, for a post in a topic the user follows.
	TopicID   *string `json:"topic_id"`
	CreatedAt int64   `json:"created_at"`
	// ReadAt is when the user opened the notification. It is null until then.
	ReadAt *int64 `json:"read_at"`
}

const (
	NotifyComment = "comment"
	NotifyAdded   = "added"
	// NotifyJoined notifies the owner that a user joined through an invite link.
	NotifyJoined = "joined"
	// NotifyTopicPost notifies a topic's followers of a post in it (architecture.md, Topics).
	NotifyTopicPost = "topic_post"
	// NotifyMessage is a message in a conversation (DM). There is at most one
	// unread row per conversation. It is marked read when the conversation's
	// chat marker moves past it (architecture.md, Notifications, 2026-11-08).
	// Room chat does not produce notifications.
	NotifyMessage = "message"
)

// Marker records how far a user has read a stream, as the newest time they
// have seen. There is one per user per stream. It only moves forward and is
// sent to that user only.
type Marker struct {
	UserID string `json:"user_id"`
	Stream string `json:"stream"`
	ReadAt int64  `json:"read_at"`
	// Unread is the number of items in the stream newer than ReadAt. For a
	// chat it counts other users' live messages. For the notifications stream
	// it counts notifications. The server computes it.
	Unread int64 `json:"unread"`
}

// Prefixes of the streams a marker can be set on, which are a group's chat
// and its feed. The notifications stream is listed with its unread count but
// cannot be marked. A notification is marked read by opening it.
const (
	streamChatPrefix = "chat:"
	streamFeedPrefix = "feed:"
)

// notify writes one notification inside the caller's transaction and returns
// its event. A user is not notified of their own action. When to == actor,
// no row is written.
func notify(r *http.Request, qtx *store.Queries, kind, to, actor, groupID string, postID *string, now int64) (*events.Entry, error) {
	return notifyIn(r, qtx, kind, to, actor, groupID, postID, nil, now)
}

// notifyMessage writes a message notification for each other member of a
// conversation who does not already have an unread one for it. It writes
// nothing for a room, and nothing for a member who has hidden the conversation.
func notifyMessage(r *http.Request, qtx *store.Queries, g Group, author string, now int64) ([]events.Entry, error) {
	if g.Kind != perm.KindDM {
		return nil, nil
	}
	members, err := qtx.ListMembers(r.Context(), g.ID)
	if err != nil {
		return nil, err
	}
	var told []events.Entry
	for _, m := range members {
		if m.ID == author || m.HiddenAt.Valid {
			continue
		}
		n, err := qtx.CountUnreadNotificationsInGroup(r.Context(), store.CountUnreadNotificationsInGroupParams{UserID: m.ID, Kind: NotifyMessage, GroupID: g.ID})
		if err != nil {
			return nil, err
		}
		if n > 0 {
			continue
		}
		e, err := notify(r, qtx, NotifyMessage, m.ID, author, g.ID, nil, now)
		if err != nil {
			return nil, err
		}
		told = append(told, *e)
	}
	return told, nil
}

// readMessageNotifications marks the user's unread message notifications for a
// conversation as read, up to the chat marker's time, and returns each updated
// row as a notification event.
func readMessageNotifications(r *http.Request, qtx *store.Queries, me, groupID string, upTo, now int64) ([]events.Entry, error) {
	ids, err := qtx.ListUnreadNotificationsInGroupUpTo(r.Context(), store.ListUnreadNotificationsInGroupUpToParams{UserID: me, Kind: NotifyMessage, GroupID: groupID, Before: upTo})
	if err != nil {
		return nil, err
	}
	var read []events.Entry
	for _, id := range ids {
		if err := qtx.ReadNotification(r.Context(), store.ReadNotificationParams{ReadAt: sql.NullInt64{Int64: now, Valid: true}, ID: id, UserID: me}); err != nil {
			return nil, err
		}
		row, err := qtx.GetNotification(r.Context(), id)
		if err != nil {
			return nil, err
		}
		read = append(read, events.Entry{Kind: "notification", Payload: wireNotification(row)})
	}
	return read, nil
}

// notifyIn is notify with the topic of a topic_post notification.
func notifyIn(r *http.Request, qtx *store.Queries, kind, to, actor, groupID string, postID, topicID *string, now int64) (*events.Entry, error) {
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
	tid := sql.NullString{}
	if topicID != nil {
		tid = sql.NullString{String: *topicID, Valid: true}
	}
	if err := qtx.CreateNotification(r.Context(), store.CreateNotificationParams{
		ID: id.String(), UserID: to, Kind: kind, ActorID: actor, GroupID: groupID, PostID: pid, TopicID: tid, CreatedAt: now,
	}); err != nil {
		return nil, err
	}
	row, err := qtx.GetNotification(r.Context(), id.String())
	if err != nil {
		return nil, err
	}
	return &events.Entry{Kind: "notification", Payload: wireNotification(row)}, nil
}

// listNotifications returns the user's notifications, newest first, paged like the feed.
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

// readNotification marks one of the user's notifications read when they open
// it (architecture.md, Notifications). The response and the event are the
// updated row.
func (s *Server) readNotification(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "notification", now, func(qtx *store.Queries) (any, int, error) {
		row, err := qtx.GetNotification(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && row.UserID != me.ID) {
			return nil, http.StatusNotFound, errors.New("No such notification")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if err := qtx.ReadNotification(r.Context(), store.ReadNotificationParams{ReadAt: sql.NullInt64{Int64: now, Valid: true}, ID: id, UserID: me.ID}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if row, err = qtx.GetNotification(r.Context(), id); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		n := wireNotification(row)
		return &n, http.StatusOK, nil
	})
}

// Cleared is the payload of a notification_delete event. It says that every read notification of the user up to Before has been deleted.
type Cleared struct {
	UserID string `json:"user_id"`
	Before int64  `json:"before"`
}

// clearNotifications permanently deletes the user's read notifications
// (architecture.md, Notifications). One event describes the deleted set, the
// read notifications up to now, rather than one event per row.
func (s *Server) clearNotifications(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "notification_delete", now, func(qtx *store.Queries) (any, int, error) {
		if err := qtx.DeleteReadNotifications(r.Context(), store.DeleteReadNotificationsParams{UserID: me.ID, Before: now}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return &Cleared{UserID: me.ID, Before: now}, http.StatusOK, nil
	})
}

// listMarkers returns a row for every stream of the user, whether or not they have read it, each with its unread count.
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

// setMarker moves the user's marker on one stream forward to read_at. The
// value is capped at now and never moves backwards. The stream is
// `chat:<group>` or `feed:<group>` for a group the user is in. A group the
// user is not in returns 404.
func (s *Server) setMarker(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ReadAt int64 `json:"read_at"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.ReadAt <= 0 {
		writeErr(w, http.StatusBadRequest, "read_at must be a time")
		return
	}
	stream := r.PathValue("stream")
	me, _ := userFrom(r.Context())
	now := db.Now()
	if in.ReadAt > now {
		in.ReadAt = now
	}
	// The marker and, for a chat stream, the message notifications that the
	// new marker position marks as read (architecture.md, Notifications) are
	// written in one transaction.
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		// reread returns the marker row after the write, as the stream's
		// list query returns it.
		var reread func() (store.ListMarkersRow, error)
		var read []events.Entry
		switch {
		case strings.HasPrefix(stream, streamChatPrefix), strings.HasPrefix(stream, streamFeedPrefix):
			chat := strings.HasPrefix(stream, streamChatPrefix)
			gid := strings.TrimPrefix(strings.TrimPrefix(stream, streamChatPrefix), streamFeedPrefix)
			a, err := actorIn(r.Context(), qtx, me, gid)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if !perm.CanSee(a) {
				return nil, nil, http.StatusNotFound, errors.New("No such room")
			}
			if chat {
				if read, err = readMessageNotifications(r, qtx, me.ID, gid, in.ReadAt, now); err != nil {
					return nil, nil, http.StatusInternalServerError, err
				}
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
			return nil, nil, http.StatusBadRequest, errors.New("No such stream")
		}
		if err := qtx.SetMarker(r.Context(), store.SetMarkerParams{UserID: me.ID, Stream: stream, ReadAt: in.ReadAt}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := reread()
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m := wireMarker(row)
		entries := append([]events.Entry{{Kind: "marker", Payload: &m}}, read...)
		if len(read) > 0 {
			// Send the notifications stream's unread count after the updated rows. A client that has
			// not loaded the notifications list cannot derive the count from the rows alone.
			bell, err := qtx.GetNotificationsMarker(r.Context(), me.ID)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			b := wireMarker(store.ListMarkersRow(bell))
			entries = append(entries, events.Entry{Kind: "marker", Payload: &b})
		}
		return entries, &m, http.StatusOK, nil
	})
}
