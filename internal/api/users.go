package api

import (
	"net/http"

	"sweet/internal/perm"
)

// listUsers returns everyone on the instance, which is the root group's
// membership: each person with their instance role and when they joined.
// Private community: any member may see the list.
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q().ListMembers(r.Context(), perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	type member struct {
		User
		Role     string `json:"role"`
		JoinedAt int64  `json:"joined_at"`
	}
	out := make([]member, 0, len(rows))
	for _, row := range rows {
		out = append(out, member{User: User{ID: row.ID, Username: row.Username, Picture: pictureURL(row.PictureID)}, Role: row.Role, JoinedAt: row.JoinedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}
