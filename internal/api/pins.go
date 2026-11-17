package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"
)

func (s *Server) setPostPinned(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Pinned *bool `json:"pinned"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Pinned == nil {
		writeErr(w, http.StatusBadRequest, "Choose whether to pin the post")
		return
	}
	me, _ := userFrom(r.Context())
	id := r.PathValue("id")
	s.logged(w, r, "post", db.Now(), func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("No such post")
		}
		if err != nil {
			return nil, 500, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, 500, err
		}
		if !perm.CanSee(a) {
			return nil, http.StatusNotFound, errors.New("No such post")
		}
		if !perm.PinPost(a) {
			return nil, http.StatusForbidden, errors.New("Not allowed")
		}
		var pinned int64
		if *in.Pinned {
			pinned = 1
		}
		if err := qtx.SetPostPinned(r.Context(), store.SetPostPinnedParams{ID: id, Pinned: pinned}); err != nil {
			return nil, 500, err
		}
		row, err := qtx.GetPost(r.Context(), id)
		p := wirePost(row)
		return &p, http.StatusOK, err
	})
}
