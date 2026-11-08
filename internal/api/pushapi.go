package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/push"
)

// pushKey is `GET /api/push/key`: the instance's public VAPID key, which the
// browser needs to subscribe. 404 while push is not set up.
func (s *Server) pushKey(w http.ResponseWriter, r *http.Request) {
	if s.PushKey == "" {
		writeErr(w, http.StatusNotFound, "Push is not set up on this server")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"key": s.PushKey})
}

// subscribePush is `POST /api/push/subscriptions {endpoint, keys: {p256dh, auth}}`,
// the subscription as the browser gives it: this device of mine.
func (s *Server) subscribePush(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !strings.HasPrefix(in.Endpoint, "https://") || in.Keys.P256dh == "" || in.Keys.Auth == "" {
		writeErr(w, http.StatusBadRequest, "A subscription has an https endpoint and two keys")
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

// pushWords is what a device shows for a notification, or ok false for the
// kinds that do not push (architecture.md: mentions and replies to your posts).
func pushWords(n Notification) (body, path string, ok bool) {
	switch n.Kind {
	case NotifyComment:
		body = n.Actor.Username + " commented on your post"
	case NotifyMention:
		body = n.Actor.Username + " mentioned you"
	default:
		return "", "", false
	}
	if n.PostID != nil {
		return body, "/p/" + *n.PostID, true
	}
	if n.GroupID == perm.Root {
		return body, "/", true
	}
	return body, "/r/" + n.GroupID, true
}

// pushAfterCommit sends a push for each notification among the events just
// committed, to its person's devices, off the request's path.
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
		if json.Unmarshal(raw, &n) != nil {
			continue
		}
		body, path, ok := pushWords(n)
		if !ok {
			continue
		}
		title := community
		if title == "" {
			title = "Sweet"
		}
		go func(uid string, p push.Payload) {
			if err := s.Push.Tell(context.Background(), uid, p); err != nil {
				log.Printf("push: %v", err)
			}
		}(n.UserID, push.Payload{Title: title, Body: body, URL: s.BaseURL + path})
	}
}
