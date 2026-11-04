package api

import "net/http"

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
		out = append(out, member{User: User{ID: row.ID, Username: row.Username, Role: row.Role}, CreatedAt: row.CreatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}
