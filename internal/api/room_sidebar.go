package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"
)

type RoomSidebar struct {
	UserID    string `json:"user_id"`
	GroupID   string `json:"group_id"`
	InSidebar bool   `json:"in_sidebar"`
}

func (s *Server) listRoomSidebar(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	rows, err := s.q().ListRoomSidebar(r.Context(), me.ID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	rooms := make([]RoomSidebar, 0, len(rows))
	for _, row := range rows {
		rooms = append(rooms, wireRoomSidebar(store.GetRoomSidebarRow{UserID: row.UserID, GroupID: row.GroupID, InSidebar: row.InSidebar}))
	}
	writeJSON(w, 200, map[string]any{"rooms": rooms})
}

func (s *Server) setRoomSidebar(w http.ResponseWriter, r *http.Request) {
	var in struct {
		InSidebar *bool `json:"in_sidebar"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if json.NewDecoder(r.Body).Decode(&in) != nil || in.InSidebar == nil {
		writeErr(w, 400, "Choose whether to add this room to the sidebar")
		return
	}
	me, _ := userFrom(r.Context())
	s.logged(w, r, "room_sidebar", db.Now(), func(q *store.Queries) (any, int, error) {
		g, _, status, err := s.groupActor(r, q)
		if err != nil {
			return nil, status, err
		}
		if g.Kind != perm.KindGroup {
			return nil, 400, errors.New("Choose a room")
		}
		var saved int64
		if *in.InSidebar {
			saved = 1
		}
		if err := q.SetRoomSidebar(r.Context(), store.SetRoomSidebarParams{UserID: me.ID, GroupID: g.ID, InSidebar: saved}); err != nil {
			return nil, 500, err
		}
		row, err := q.GetRoomSidebar(r.Context(), store.GetRoomSidebarParams{UserID: me.ID, GroupID: g.ID})
		return wireRoomSidebar(row), 200, err
	})
}
