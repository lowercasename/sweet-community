package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/db"
	"sweet/internal/store"
)

type PostNotificationPreference struct {
	UserID    string `json:"user_id"`
	PostID    string `json:"post_id"`
	Muted     bool   `json:"muted"`
	Following bool   `json:"following"`
}

type RoomNotificationPreference struct {
	UserID  string `json:"user_id"`
	GroupID string `json:"group_id"`
	Mode    string `json:"mode"`
}

func (s *Server) getPostNotificationPreference(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, _, status, err := s.postActor(r, s.q(), id); err != nil {
		writeErr(w, status, err.Error())
		return
	}
	me, _ := userFrom(r.Context())
	row, err := s.q().GetPostNotificationPreference(r.Context(), store.GetPostNotificationPreferenceParams{UserID: me.ID, PostID: id})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, wirePostNotificationPreference(me.ID, row))
}

func (s *Server) setPostNotificationPreference(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Following *bool `json:"following"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if json.NewDecoder(r.Body).Decode(&in) != nil || in.Following == nil {
		writeErr(w, 400, "Choose whether to follow this discussion")
		return
	}
	me, _ := userFrom(r.Context())
	id := r.PathValue("id")
	s.logged(w, r, "post_notification_preference", db.Now(), func(q *store.Queries) (any, int, error) {
		if _, _, status, err := s.postActor(r, q, id); err != nil {
			return nil, status, err
		}
		var enabled int64
		if *in.Following {
			enabled = 1
		}
		if err := q.SetPostNotificationPreference(r.Context(), store.SetPostNotificationPreferenceParams{UserID: me.ID, PostID: id, Enabled: enabled}); err != nil {
			return nil, 500, err
		}
		row, err := q.GetPostNotificationPreference(r.Context(), store.GetPostNotificationPreferenceParams{UserID: me.ID, PostID: id})
		return wirePostNotificationPreference(me.ID, row), 200, err
	})
}

func (s *Server) getRoomNotificationPreference(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	row, err := s.q().GetRoomNotificationPreference(r.Context(), store.GetRoomNotificationPreferenceParams{UserID: me.ID, GroupID: r.PathValue("gid")})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, wireRoomNotificationPreference(me.ID, row))
}

func (s *Server) setRoomNotificationPreference(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Mode string `json:"mode"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if json.NewDecoder(r.Body).Decode(&in) != nil || (in.Mode != "all" && in.Mode != "mentions" && in.Mode != "off") {
		writeErr(w, 400, "Choose all messages, mentions and replies, or off")
		return
	}
	me, _ := userFrom(r.Context())
	s.logged(w, r, "room_notification_preference", db.Now(), func(q *store.Queries) (any, int, error) {
		g, _, status, err := s.groupActor(r, q)
		if err != nil {
			return nil, status, err
		}
		if g.Kind == "dm" {
			return nil, 400, errors.New("Use the private conversation notification setting")
		}
		if err := q.SetRoomNotificationPreference(r.Context(), store.SetRoomNotificationPreferenceParams{UserID: me.ID, GroupID: g.ID, Mode: in.Mode}); err != nil {
			return nil, 500, err
		}
		row, err := q.GetRoomNotificationPreference(r.Context(), store.GetRoomNotificationPreferenceParams{UserID: me.ID, GroupID: g.ID})
		return wireRoomNotificationPreference(me.ID, row), 200, err
	})
}
