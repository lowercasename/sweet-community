package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"sweet/internal/store"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/push"
)

// pushKey is `GET /api/push/key`. It returns the instance's public VAPID key,
// which the browser needs to subscribe. It returns 404 while push is not set up.
func (s *Server) pushKey(w http.ResponseWriter, r *http.Request) {
	if s.PushKey == "" {
		writeErr(w, http.StatusNotFound, "Push is not set up on this server")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"key": s.PushKey})
}

// subscribePush is `POST /api/push/subscriptions {endpoint, keys: {p256dh, auth}}`.
// The body is the subscription for the user's current device, as the browser
// provides it.
func (s *Server) subscribePush(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !push.AllowedEndpoint(in.Endpoint) || in.Keys.P256dh == "" || in.Keys.Auth == "" {
		writeErr(w, http.StatusBadRequest, "This browser's notification service is not supported")
		return
	}
	me, _ := userFrom(r.Context())
	if err := push.Subscribe(r.Context(), s.DB, me.ID, push.Subscription{Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth}, db.Now()); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// unsubscribePush is `DELETE /api/push/subscriptions {endpoint}`.
func (s *Server) unsubscribePush(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Endpoint == "" {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	me, _ := userFrom(r.Context())
	if err := push.Unsubscribe(r.Context(), s.DB, me.ID, in.Endpoint); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

// pushWords describes the latest action without including user content.
func pushWords(n Notification) (body, path, tag string, ok bool) {
	if n.Kind == NotifyReport {
		if n.ReportKind == nil {
			return "", "", "", false
		}
		body, ok = map[string]string{"post": "Post reported", "comment": "Comment reported", "message": "Message reported"}[*n.ReportKind]
		return body, "/community", "", ok
	}
	if n.Actor == nil {
		return "", "", "", false
	}
	switch n.Kind {
	case NotifyComment:
		body = n.Actor.Username + " commented in a discussion you follow"
	case NotifyMention:
		body = n.Actor.Username + " mentioned you"
	case NotifyReply:
		body = n.Actor.Username + " replied to your message"
	case NotifyMessage:
		body = n.Actor.Username + " sent a message"
		if n.GroupKind == perm.KindDM {
			body = n.Actor.Username + " messaged you"
		}
	default:
		return "", "", "", false
	}
	if n.PostID != nil {
		return body, "/p/" + *n.PostID, "post:" + *n.PostID, true
	}
	path = "/r/" + n.GroupID
	if n.GroupID == perm.Root {
		path = "/"
	}
	if n.MessageID != nil {
		path += "?message=" + url.QueryEscape(*n.MessageID)
	}
	return body, path, streamChatPrefix + n.GroupID, true
}

// pushAfterCommit sends a push for each notification among the events just
// committed, to the recipient's devices, in goroutines outside the request.
func (s *Server) pushAfterCommit(payloads []json.RawMessage, community string) {
	if s.Push == nil {
		return
	}
	if community == "" {
		if st, err := s.settings(context.Background()); err == nil {
			community = st.Name
		}
	}
	for _, raw := range payloads {
		var n Notification
		if json.Unmarshal(raw, &n) != nil || n.ReadAt != nil {
			// A notification that is already read (marked by a chat marker update) is not pushed.
			continue
		}
		body, path, tag, ok := pushWords(n)
		if !ok {
			continue
		}
		title := community
		if title == "" {
			title = "Sweet"
		}
		go func(uid string, p push.Payload) {
			if err := s.Push.Tell(context.Background(), uid, p, func(ctx context.Context) (bool, error) { return s.pushAllowed(ctx, n) }); err != nil {
				log.Printf("push: %v", err)
			}
		}(n.UserID, push.Payload{ID: n.ID, Revision: n.ActivityCount, Scope: n.Scope, At: n.CreatedAt, Title: title, Body: body, URL: s.BaseURL + path, Tag: tag})
	}
}

// pushAllowed rechecks the recipient, content and preferences before each device delivery.
func (s *Server) pushAllowed(ctx context.Context, n Notification) (bool, error) {
	q := s.q()
	row, err := q.GetNotification(ctx, n.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if row.ReadAt.Valid {
		return false, nil
	}
	if n.Scope != "" {
		readAt, err := q.GetReadPosition(ctx, store.GetReadPositionParams{UserID: n.UserID, Stream: n.Scope})
		if err != nil || readAt >= n.CreatedAt {
			return false, err
		}
	}
	u, err := q.GetUser(ctx, n.UserID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if u.RemovedAt.Valid {
		return false, nil
	}
	if n.Kind == NotifyReport {
		author, err := q.GetNotificationReportAuthor(ctx, n.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		a, err := actorIn(ctx, q, User{ID: n.UserID}, perm.Root)
		return perm.HandleReport(a, author), err
	}
	g, err := q.GetGroup(ctx, n.GroupID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	member, err := q.GetMembership(ctx, store.GetMembershipParams{GroupID: n.GroupID, UserID: n.UserID})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !perm.CanSee(perm.Actor{ID: n.UserID, Role: member.Role}) {
		return false, nil
	}
	if n.PostID != nil {
		_, err := q.GetPostOwners(ctx, *n.PostID)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		muted, err := q.IsPostMuted(ctx, store.IsPostMutedParams{UserID: n.UserID, PostID: *n.PostID})
		if err != nil || muted {
			return false, err
		}
	}
	if n.MessageID != nil {
		_, err := q.GetMessageOwners(ctx, *n.MessageID)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
	}
	settings, err := q.ListUserSettings(ctx, n.UserID)
	if err != nil {
		return false, err
	}
	st := wireMySettings(n.UserID, settings)
	if n.PostID == nil && (n.Kind == NotifyMessage || n.Kind == NotifyMention || n.Kind == NotifyReply) {
		if g.Kind == perm.KindDM {
			return st.PushConversations, nil
		}
		pref, err := q.GetRoomNotificationPreference(ctx, store.GetRoomNotificationPreferenceParams{GroupID: n.GroupID, UserID: n.UserID})
		if err != nil {
			return false, err
		}
		if pref.Mode == "off" || (pref.Mode == "mentions" && n.Kind == NotifyMessage) {
			return false, nil
		}
	}
	switch n.Kind {
	case NotifyComment:
		return st.PushComments, nil
	case NotifyMention, NotifyReply:
		return st.PushMentions, nil
	case NotifyMessage:
		return true, nil
	default:
		return false, nil
	}
}
