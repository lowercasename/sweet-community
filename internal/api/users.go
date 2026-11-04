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

// listUsers returns every member, oldest first. Private community: any member may see the list.
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q().ListUsers(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	type member struct {
		User
		CreatedAt int64 `json:"created_at"`
	}
	out := make([]member, 0, len(rows))
	for _, row := range rows {
		out = append(out, member{User: User{ID: row.ID, Username: row.Username, Role: row.Role, Picture: pictureURL(row.PictureID)}, CreatedAt: row.CreatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

// setRole makes someone a member or a moderator (perm.SetRole says who may,
// of whom). The change is a "user" event so every page's controls follow it.
func (s *Server) setRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if in.Role != perm.Member && in.Role != perm.Moderator {
		writeErr(w, http.StatusBadRequest, "role must be member or moderator")
		return
	}
	me, _ := userFrom(r.Context())
	id := r.PathValue("id")
	s.logged(w, r, "user", db.Now(), func(qtx *store.Queries) (any, int, error) {
		row, err := qtx.GetUser(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such user")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		target := User{ID: row.ID, Username: row.Username, Role: row.Role, Picture: pictureURL(row.PictureID)}
		if !perm.SetRole(actor(me), actor(target), in.Role) {
			return nil, http.StatusForbidden, errors.New("not allowed")
		}
		if err := qtx.SetUserRole(r.Context(), store.SetUserRoleParams{Role: in.Role, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		target.Role = in.Role
		return target, http.StatusOK, nil
	})
}
