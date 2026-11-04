// Package api holds the HTTP handlers: sessions and invites, posts, chat
// messages, the event stream. Everything but sign-in, join and healthz
// requires a session (see auth.go).
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/sanitize"
)

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	// Role is "owner" (runs the instance) or "member".
	Role string `json:"role"`
}

// Post is the wire shape. It carries no event sequence: the SSE "id:" line
// is the sequence, and the feed paginates by created_at.
type Post struct {
	ID        string `json:"id"`
	Author    User   `json:"author"`
	BodyHTML  string `json:"body_html"`
	BodyText  string `json:"body_text"`
	CreatedAt int64  `json:"created_at"`
	EditedAt  *int64 `json:"edited_at"`
}

type Server struct {
	DB  *sql.DB
	Hub *events.Hub

	limiter loginLimiter
}

// EnsureOwner makes sure the instance has its owner account. On first run it
// creates the user; whenever the owner has no password yet and one is given,
// it sets it. A password given later is ignored: change it in the app.
func EnsureOwner(ctx context.Context, d *sql.DB, username, password string) (User, error) {
	u := User{Username: username, Role: "owner"}
	var hash sql.NullString
	err := d.QueryRowContext(ctx, `SELECT id, password_hash FROM users WHERE username = ?`, username).Scan(&u.ID, &hash)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		id, err := uuid.NewV7()
		if err != nil {
			return u, err
		}
		u.ID = id.String()
		if _, err := d.ExecContext(ctx, `INSERT INTO users (id, username, role, created_at) VALUES (?, ?, 'owner', ?)`, u.ID, u.Username, db.Now()); err != nil {
			return u, err
		}
	case err != nil:
		return u, err
	default:
		if _, err := d.ExecContext(ctx, `UPDATE users SET role = 'owner' WHERE id = ?`, u.ID); err != nil {
			return u, err
		}
	}
	if !hash.Valid && password != "" {
		h, err := auth.HashPassword(password)
		if err != nil {
			return u, err
		}
		if _, err := d.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, h, u.ID); err != nil {
			return u, err
		}
	}
	return u, nil
}

// OwnerHasPassword reports whether the owner can sign in at all.
func OwnerHasPassword(ctx context.Context, d *sql.DB, username string) bool {
	var hash sql.NullString
	if err := d.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE username = ?`, username).Scan(&hash); err != nil {
		return false
	}
	return hash.Valid
}

func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })

	// Public: the way in.
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("GET /api/invites/{code}", s.getInvite)
	mux.HandleFunc("POST /api/register", s.register)

	// Members.
	mux.HandleFunc("GET /api/me", s.requireAuth(s.me))
	mux.HandleFunc("POST /api/logout", s.requireAuth(s.logout))
	mux.HandleFunc("POST /api/logout-all", s.requireAuth(s.logoutAll))
	mux.HandleFunc("GET /api/users", s.requireAuth(s.listUsers))
	mux.HandleFunc("GET /api/posts", s.requireAuth(s.listPosts))
	mux.HandleFunc("POST /api/posts", s.requireAuth(s.createPost))
	mux.HandleFunc("PUT /api/posts/{id}", s.requireAuth(s.editPost))
	mux.HandleFunc("GET /api/messages", s.requireAuth(s.listMessages))
	mux.HandleFunc("POST /api/messages", s.requireAuth(s.createMessage))
	mux.HandleFunc("GET /api/events", s.requireAuth(s.Hub.ServeHTTP))

	// Owner.
	mux.HandleFunc("GET /api/invites", s.requireOwner(s.listInvites))
	mux.HandleFunc("POST /api/invites", s.requireOwner(s.createInvite))
	mux.HandleFunc("DELETE /api/invites/{code}", s.requireOwner(s.deleteInvite))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) listPosts(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	before := int64(1 << 62)
	if v, err := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64); err == nil && v > 0 {
		before = v
	}
	rows, err := s.DB.QueryContext(r.Context(), `
		SELECT p.id, p.body_html, p.body_text, p.created_at, p.edited_at, u.id, u.username, u.role
		FROM posts p JOIN users u ON u.id = p.author_id
		WHERE p.deleted_at IS NULL AND p.created_at < ?
		ORDER BY p.created_at DESC, p.id DESC
		LIMIT ?`, before, limit+1)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	posts := []Post{}
	for rows.Next() {
		var p Post
		if err := rows.Scan(&p.ID, &p.BodyHTML, &p.BodyText, &p.CreatedAt, &p.EditedAt, &p.Author.ID, &p.Author.Username, &p.Author.Role); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		posts = append(posts, p)
	}
	var next *int64
	if len(posts) > limit {
		posts = posts[:limit]
		n := posts[len(posts)-1].CreatedAt
		next = &n
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": posts, "next_before": next})
}

// readBody decodes {body_html}, sanitises it, and writes the 400 itself when
// the body is malformed or empty. ok is false after a 400.
func readBody(w http.ResponseWriter, r *http.Request) (clean string, ok bool) {
	var in struct {
		BodyHTML string `json:"body_html"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return "", false
	}
	clean = sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		writeErr(w, http.StatusBadRequest, "body is empty")
		return "", false
	}
	return clean, true
}

func (s *Server) createPost(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	author, _ := userFrom(r.Context())
	p := Post{ID: id.String(), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), CreatedAt: db.Now()}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil) // BEGIN IMMEDIATE via _txlock
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO posts (id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?)`,
		p.ID, p.Author.ID, p.BodyHTML, p.BodyText, p.CreatedAt); err != nil {
		tx.Rollback()
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ev, err := events.Log(ctx, tx, "post", &p, p.CreatedAt)
	if err != nil {
		tx.Rollback()
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.Hub.Broadcast(ev)
	writeJSON(w, http.StatusCreated, p)
}

// editPost replaces a post's body. The whole sanitised HTML is the unit of
// edit: no diffs, no versions. The new body is logged as a "post_edit" event
// carrying the full post, so live clients replace it in place.
func (s *Server) editPost(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	now := db.Now()
	author, _ := userFrom(r.Context())
	p := Post{ID: id, Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Only the author may edit; anyone else gets the same 404 as a missing post.
	err = tx.QueryRowContext(ctx, `
		UPDATE posts SET body_html = ?, body_text = ?, edited_at = ?
		WHERE id = ? AND author_id = ? AND deleted_at IS NULL
		RETURNING created_at`, p.BodyHTML, p.BodyText, now, id, author.ID).Scan(&p.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		tx.Rollback()
		writeErr(w, http.StatusNotFound, "no such post")
		return
	}
	if err != nil {
		tx.Rollback()
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ev, err := events.Log(ctx, tx, "post_edit", &p, now)
	if err != nil {
		tx.Rollback()
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.Hub.Broadcast(ev)
	writeJSON(w, http.StatusOK, p)
}
