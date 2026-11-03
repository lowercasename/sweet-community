// Package api holds the HTTP handlers for the PoC: me, posts, events.
// No auth yet: a single owner user, created at startup, authors everything.
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

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/sanitize"
)

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
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
	DB    *sql.DB
	Hub   *events.Hub
	Owner User
}

// EnsureOwner creates the single PoC user if it doesn't exist.
func EnsureOwner(ctx context.Context, d *sql.DB, username string) (User, error) {
	var u User
	err := d.QueryRowContext(ctx, `SELECT id, username FROM users WHERE username = ?`, username).Scan(&u.ID, &u.Username)
	if err == nil {
		return u, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return u, err
	}
	id, err := uuid.NewV7()
	if err != nil {
		return u, err
	}
	u = User{ID: id.String(), Username: username}
	_, err = d.ExecContext(ctx, `INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)`, u.ID, u.Username, db.Now())
	return u, err
}

func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })
	mux.HandleFunc("GET /api/me", s.me)
	mux.HandleFunc("GET /api/posts", s.listPosts)
	mux.HandleFunc("POST /api/posts", s.createPost)
	mux.HandleFunc("PUT /api/posts/{id}", s.editPost)
	mux.Handle("GET /api/events", s.Hub)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.Owner)
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
		SELECT p.id, p.body_html, p.body_text, p.created_at, p.edited_at, u.id, u.username
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
		if err := rows.Scan(&p.ID, &p.BodyHTML, &p.BodyText, &p.CreatedAt, &p.EditedAt, &p.Author.ID, &p.Author.Username); err != nil {
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
		writeErr(w, http.StatusBadRequest, "post is empty")
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
	p := Post{ID: id.String(), Author: s.Owner, BodyHTML: clean, BodyText: sanitize.Text(clean), CreatedAt: db.Now()}

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
	p := Post{ID: id, Author: s.Owner, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Only the author may edit (the owner is the only user for now).
	err = tx.QueryRowContext(ctx, `
		UPDATE posts SET body_html = ?, body_text = ?, edited_at = ?
		WHERE id = ? AND author_id = ? AND deleted_at IS NULL
		RETURNING created_at`, p.BodyHTML, p.BodyText, now, id, s.Owner.ID).Scan(&p.CreatedAt)
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
