package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"sweet/internal/auth"
	"sweet/internal/db"
)

// InviteTTL is how long an invite link works.
const InviteTTL = 7 * 24 * time.Hour

type Invite struct {
	Code      string `json:"code"`
	URL       string `json:"url"`
	CreatedBy User   `json:"created_by"`
	CreatedAt int64  `json:"created_at"`
	ExpiresAt int64  `json:"expires_at"`
}

// createInvite (owner) mints a single-use link, good for InviteTTL.
func (s *Server) createInvite(w http.ResponseWriter, r *http.Request) {
	u, _ := userFrom(r.Context())
	code, err := auth.NewCode()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := db.Now()
	inv := Invite{Code: code, URL: "/join/" + code, CreatedBy: u, CreatedAt: now, ExpiresAt: now + InviteTTL.Milliseconds()}
	if _, err := s.DB.ExecContext(r.Context(), `INSERT INTO invites (code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		inv.Code, u.ID, inv.CreatedAt, inv.ExpiresAt); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, inv)
}

// listInvites (owner) returns the links that are still open.
func (s *Server) listInvites(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.QueryContext(r.Context(), `
		SELECT i.code, i.created_at, i.expires_at, u.id, u.username, u.role
		FROM invites i JOIN users u ON u.id = i.created_by
		WHERE i.used_at IS NULL AND i.expires_at > ?
		ORDER BY i.created_at DESC`, db.Now())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	out := []Invite{}
	for rows.Next() {
		var inv Invite
		if err := rows.Scan(&inv.Code, &inv.CreatedAt, &inv.ExpiresAt, &inv.CreatedBy.ID, &inv.CreatedBy.Username, &inv.CreatedBy.Role); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		inv.URL = "/join/" + inv.Code
		out = append(out, inv)
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": out})
}

// deleteInvite (owner) revokes an open link.
func (s *Server) deleteInvite(w http.ResponseWriter, r *http.Request) {
	res, err := s.DB.ExecContext(r.Context(), `DELETE FROM invites WHERE code = ? AND used_at IS NULL`, r.PathValue("code"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "no such invite")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// getInvite (public) tells the join page whether a link is good and who sent it.
func (s *Server) getInvite(w http.ResponseWriter, r *http.Request) {
	var by string
	err := s.DB.QueryRowContext(r.Context(), `
		SELECT u.username FROM invites i JOIN users u ON u.id = i.created_by
		WHERE i.code = ? AND i.used_at IS NULL AND i.expires_at > ?`, r.PathValue("code"), db.Now()).Scan(&by)
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "this invite link has been used or has expired")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invited_by": by})
}

// register (public) turns a valid invite into an account and signs it in.
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
		credentials
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if err := auth.ValidateUsername(in.Username); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := auth.ValidatePassword(in.Password); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	u := User{ID: id.String(), Username: in.Username, Role: "member"}
	now := db.Now()

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	// User first (so the invite can reference it), then claim the invite. The
	// UPDATE's WHERE makes a link single-use even under two simultaneous
	// registrations: BEGIN IMMEDIATE serialises them and the second sees
	// used_at set, rolls back, and the user it inserted goes with it.
	if _, err := tx.ExecContext(ctx, `INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'member', ?)`,
		u.ID, u.Username, hash, now); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, "that username is taken")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	res, err := tx.ExecContext(ctx, `UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_at IS NULL AND expires_at > ?`,
		u.ID, now, in.Code, now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeErr(w, http.StatusNotFound, "this invite link has been used or has expired")
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	token, err := s.issueSession(w, r, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": u, "token": token})
}
