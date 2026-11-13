package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sweet/internal/sanitize"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Notification is one recipient's entry for an action, or for all the activity in one discussion (Scope).
type Notification struct {
	GroupKind string `json:"group_kind"`
	Scope     string `json:"scope"`
	// ActivityCount counts all the activity the notification holds. It only grows, so it is the notification's version.
	ActivityCount int64 `json:"activity_count"`
	// Updates counts the activity since the notification was last made unread.
	Updates int64  `json:"updates"`
	ID      string `json:"id"`
	UserID  string `json:"user_id"`
	Kind    string `json:"kind"`
	Actor   *User  `json:"actor"` // Report notifications do not identify the reporter.
	// GroupID is the group the action happened in. PostID is the post, for a comment.
	GroupID string  `json:"group_id"`
	PostID  *string `json:"post_id"`
	// TopicID is the topic, for a post in a topic the user follows.
	TopicID *string `json:"topic_id"`
	// MessageID is the chat message a mention or reply is in, for scrolling to it.
	MessageID *string `json:"message_id"`
	// ReportKind is the kind of item reported (post, comment or message), for a report notification.
	ReportKind *string `json:"report_kind"`
	CreatedAt  int64   `json:"created_at"`
	// ReadAt is when the notification or its discussion was read.
	ReadAt *int64 `json:"read_at"`
}

const (
	NotifyComment = "comment"
	NotifyAdded   = "added"
	// NotifyJoined notifies the owner and the moderators that a user joined through an invite link.
	NotifyJoined = "joined"
	// NotifyTopicPost notifies a topic's followers of a post in it.
	NotifyTopicPost = "topic_post"
	// NotifyMessage is a message in any chat.
	NotifyMessage = "message"
	// NotifyReply: a reply to the user's message in a room's chat.
	NotifyReply = "reply"
	// NotifyReport notifies the owner and the moderators that a member reported a post, comment or message.
	// It names the report.
	NotifyReport = "report"
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

// notifyMessage notifies each other visible member once, preferring a mention or reply over an ordinary message.
func notifyMessage(r *http.Request, qtx *store.Queries, g Group, author, answered, messageID, body string, now int64) ([]events.Entry, error) {
	members, err := qtx.ListMembers(r.Context(), g.ID)
	if err != nil {
		return nil, err
	}
	mentions := sanitize.Mentions(body)
	var told []events.Entry
	for _, m := range members {
		if m.ID == author || m.HiddenAt.Valid {
			continue
		}
		kind := NotifyMessage
		if g.Kind != perm.KindDM {
			if m.ID == answered {
				kind = NotifyReply
			}
			if slices.Contains(mentions, m.ID) {
				kind = NotifyMention
			}
		}
		e, err := notifyAbout(r, qtx, kind, m.ID, author, g.ID, nil, nil, &messageID, now)
		if err != nil {
			return nil, err
		}
		if e != nil {
			told = append(told, *e)
		}
	}
	return told, nil
}

// readNotifications marks activity through the supplied time and returns the changed rows.
func readNotifications(r *http.Request, qtx *store.Queries, me, scope string, upTo, now int64) ([]events.Entry, error) {
	ids, err := qtx.ListUnreadNotificationsUpTo(r.Context(), store.ListUnreadNotificationsUpToParams{UserID: me, Scope: scope, Before: upTo})
	if err != nil {
		return nil, err
	}
	var read []events.Entry
	for _, id := range ids {
		if err := qtx.ReadNotification(r.Context(), store.ReadNotificationParams{ReadAt: sql.NullInt64{Int64: now, Valid: true}, ID: id, UserID: me, Before: upTo}); err != nil {
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
	return notifyAbout(r, qtx, kind, to, actor, groupID, postID, topicID, nil, now)
}

// notifyAbout is notifyIn with the chat message a mention or reply is in, so
// opening the notification can scroll the chat to it.
func notifyAbout(r *http.Request, qtx *store.Queries, kind, to, actor, groupID string, postID, topicID, messageID *string, now int64) (*events.Entry, error) {
	opt := func(v *string) sql.NullString {
		if v == nil {
			return sql.NullString{}
		}
		return sql.NullString{String: *v, Valid: true}
	}
	return insertNotification(r, qtx, store.CreateNotificationParams{
		UserID: to, Kind: kind, ActorID: actor, GroupID: groupID, PostID: opt(postID), TopicID: opt(topicID), MessageID: opt(messageID), CreatedAt: now,
	})
}

// insertNotification writes one notification and returns its event. It writes nothing when the recipient is the
// actor, and nothing for a removed recipient.
func insertNotification(r *http.Request, qtx *store.Queries, p store.CreateNotificationParams) (*events.Entry, error) {
	if p.UserID == p.ActorID {
		return nil, nil
	}
	// A removed user is notified of nothing, for example of a comment on a post they wrote before the removal.
	if u, err := qtx.GetUser(r.Context(), p.UserID); errors.Is(err, sql.ErrNoRows) || (err == nil && u.RemovedAt.Valid) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	if p.Kind != NotifyReport {
		a, err := actorIn(r.Context(), qtx, User{ID: p.UserID}, p.GroupID)
		if err != nil {
			return nil, err
		}
		if !perm.CanSee(a) {
			return nil, nil
		}
	}
	if p.PostID.Valid && p.Kind != NotifyReport {
		muted, err := qtx.IsPostMuted(r.Context(), store.IsPostMutedParams{UserID: p.UserID, PostID: p.PostID.String})
		if err != nil {
			return nil, err
		}
		if muted {
			return nil, nil
		}
		p.Scope = "post:" + p.PostID.String
	} else if p.Kind == NotifyMessage || p.Kind == NotifyMention || p.Kind == NotifyReply {
		p.Scope = streamChatPrefix + p.GroupID
	}
	if err := saveNotification(r, qtx, &p); err != nil {
		return nil, err
	}
	row, err := qtx.GetNotification(r.Context(), p.ID)
	if err != nil {
		return nil, err
	}
	return &events.Entry{Kind: "notification", Payload: wireNotification(row)}, nil
}

// saveNotification writes p and sets p.ID to the row written. A discussion (p.Scope) has one notification, read or
// unread. New activity updates it and makes it unread again.
func saveNotification(r *http.Request, qtx *store.Queries, p *store.CreateNotificationParams) error {
	if p.Scope != "" {
		id, err := qtx.GetNotificationInScope(r.Context(), store.GetNotificationInScopeParams{UserID: p.UserID, Scope: p.Scope})
		if err == nil {
			p.ID = id
			return qtx.AddNotificationActivity(r.Context(), store.AddNotificationActivityParams{
				ID: id, Kind: p.Kind, ActorID: p.ActorID, TopicID: p.TopicID, MessageID: p.MessageID, CreatedAt: p.CreatedAt,
			})
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	id, err := uuid.NewV7()
	if err != nil {
		return err
	}
	p.ID = id.String()
	return qtx.CreateNotification(r.Context(), *p)
}

// listNotifications returns the user's notifications, newest first, paged like the feed.
func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	before, limit, err := pageParams(r, 30, 100)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	rows, err := s.q().ListNotifications(r.Context(), store.ListNotificationsParams{UserID: me.ID, Before: before.CreatedAt, BeforeID: before.ID, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Notification, 0, len(rows))
	for _, row := range rows {
		out = append(out, wireNotification(store.GetNotificationRow(row)))
	}
	out, next := page(out, limit, func(n Notification) pageCursor { return pageCursor{n.CreatedAt, n.ID} })
	writeJSON(w, http.StatusOK, map[string]any{"notifications": out, "next_before": next})
}

// readNotification marks one of the user's notifications read when they open
// it. The response and the event are the
// updated row.
func (s *Server) readNotification(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	before := now
	var revision int64
	if value := r.URL.Query().Get("revision"); value != "" {
		n, err := strconv.ParseInt(value, 10, 64)
		if err != nil || n < 1 {
			writeErr(w, 400, "Invalid notification revision")
			return
		}
		revision = n
	}
	if v := r.URL.Query().Get("before"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			writeErr(w, 400, "Invalid notification time")
			return
		}
		before = min(n, now)
	}
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		row, err := qtx.GetNotification(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && row.UserID != me.ID) {
			return nil, nil, http.StatusNotFound, errors.New("No such notification")
		}
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if row.CreatedAt > before || (revision > 0 && row.ActivityCount > revision) || row.ReadAt.Valid {
			n := wireNotification(row)
			return nil, &n, http.StatusOK, nil
		}
		if err := qtx.ReadNotification(r.Context(), store.ReadNotificationParams{ReadAt: sql.NullInt64{Int64: now, Valid: true}, ID: id, UserID: me.ID, Before: before, Revision: revision}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if row, err = qtx.GetNotification(r.Context(), id); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		n := wireNotification(row)
		return []events.Entry{{Kind: "notification", Payload: &n}}, &n, http.StatusOK, nil
	})
}

// Cleared identifies the notifications removed through Before.
type Cleared struct {
	UserID string `json:"user_id"`
	Before int64  `json:"before"`
}

// clearNotifications deletes read and unread notifications without moving content markers.
func (s *Server) clearNotifications(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "notification_delete", now, func(qtx *store.Queries) (any, int, error) {
		if err := qtx.DeleteNotifications(r.Context(), store.DeleteNotificationsParams{UserID: me.ID, Before: now}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return &Cleared{UserID: me.ID, Before: now}, http.StatusOK, nil
	})
}

// readAllNotifications keeps notification history without marking the underlying content read.
func (s *Server) readAllNotifications(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		entries, err := readNotifications(r, qtx, me.ID, "", now, now)
		if err != nil {
			return nil, nil, 500, err
		}
		row, err := qtx.GetNotificationsMarker(r.Context(), me.ID)
		m := wireMarker(store.ListMarkersRow(row))
		return append(entries, events.Entry{Kind: "marker", Payload: &m}), &m, 200, err
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
	// new marker position marks as read are
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
				if read, err = readNotifications(r, qtx, me.ID, stream, in.ReadAt, now); err != nil {
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
		case strings.HasPrefix(stream, "post:"):
			pid := strings.TrimPrefix(stream, "post:")
			if _, _, status, err := s.postActor(r, qtx, pid); err != nil {
				return nil, nil, status, err
			}
			var err error
			read, err = readNotifications(r, qtx, me.ID, stream, in.ReadAt, now)
			if err != nil {
				return nil, nil, 500, err
			}
			reread = func() (store.ListMarkersRow, error) {
				row, err := qtx.GetPostMarker(r.Context(), store.GetPostMarkerParams{UserID: me.ID, PostID: pid})
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
