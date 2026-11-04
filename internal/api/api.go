// Package api holds the HTTP handlers: sessions and invites, posts, comments,
// chat messages, the event stream. Everything but sign-in, join and healthz
// requires a session (see auth.go). SQL lives in internal/store (sqlc).
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
	"sweet/internal/images"
	"sweet/internal/perm"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	// Role is "owner" (runs the instance), "moderator" or "member".
	Role string `json:"role"`
	// Picture is the avatar's url, or null for the donut.
	Picture *string `json:"picture"`
}

// Can is what the requesting user may do to a resource, computed by perm on
// the way out. The frontend shows controls from these and holds no rules.
type Can struct {
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
}

// Abilities are the instance-level things a user may do, on /api/me.
type Abilities struct {
	Invite      bool `json:"invite"`
	ManageRoles bool `json:"manage_roles"`
}

// Me is the signed-in user as they see themselves: a User plus abilities.
type Me struct {
	User
	Can Abilities `json:"can"`
}

func meOf(u User) Me {
	a := actor(u)
	return Me{User: u, Can: Abilities{Invite: perm.Invite(a), ManageRoles: perm.ManageRoles(a)}}
}

// Post is the wire shape. It carries no event sequence: the SSE "id:" line
// is the sequence, and the feed paginates by created_at.
type Post struct {
	ID           string `json:"id"`
	Author       User   `json:"author"`
	BodyHTML     string `json:"body_html"`
	BodyText     string `json:"body_text"`
	CreatedAt    int64  `json:"created_at"`
	EditedAt     *int64 `json:"edited_at"`
	CommentCount int64  `json:"comment_count"`
	Can          Can    `json:"can"`
}

// forViewer fills in the viewer's can flags on a post, comment or message.
// Anything else passes through. Used on every response and on the stream.
func forViewer(viewer User, v any) any {
	a := actor(viewer)
	switch x := v.(type) {
	case *Post:
		p := *x
		p.Can = Can{Edit: perm.EditPost(a, perm.Post{AuthorID: p.Author.ID}), Delete: perm.DeletePost(a, perm.Post{AuthorID: p.Author.ID})}
		return &p
	case *Comment:
		c := *x
		pc := perm.Comment{AuthorID: c.Author.ID, PostAuthorID: c.PostAuthorID}
		c.Can = Can{Edit: perm.EditComment(a, pc), Delete: perm.DeleteComment(a, pc)}
		return &c
	case *Message:
		m := *x
		m.Can = Can{Delete: perm.DeleteMessage(a, perm.Message{AuthorID: m.Author.ID})}
		return &m
	}
	return v
}

// decorateEvent is forViewer for a logged event: the payload is parsed into
// its resource, flagged for the viewer, and re-encoded.
func decorateEvent(viewer User, e events.Event) events.Event {
	var v any
	switch e.Kind {
	case "post":
		v = &Post{}
	case "comment":
		v = &Comment{}
	case "message":
		v = &Message{}
	default:
		return e
	}
	if json.Unmarshal(e.Payload, v) != nil {
		return e
	}
	raw, err := json.Marshal(forViewer(viewer, v))
	if err != nil {
		return e
	}
	e.Payload = raw
	return e
}

// events is the SSE endpoint, personalised for the signed-in viewer.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	viewer, _ := userFrom(r.Context())
	s.Hub.Serve(w, r, func(e events.Event) events.Event { return decorateEvent(viewer, e) })
}

type Server struct {
	DB  *sql.DB
	Hub *events.Hub
	// Images is nil when no storage is configured; uploads then 501.
	Images images.Store

	limiter loginLimiter
}

func (s *Server) q() *store.Queries { return store.New(s.DB) }

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

// EnsureOwner makes sure the instance has its owner account. On first run it
// creates the user; whenever the owner has no password yet and one is given,
// it sets it. A password given later is ignored: change it in the app.
func EnsureOwner(ctx context.Context, d *sql.DB, username, password string) (User, error) {
	q := store.New(d)
	u := User{Username: username, Role: "owner"}
	row, err := q.GetUserByUsername(ctx, username)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		id, err := uuid.NewV7()
		if err != nil {
			return u, err
		}
		u.ID = id.String()
		if err := q.CreateUser(ctx, store.CreateUserParams{ID: u.ID, Username: u.Username, Role: "owner", CreatedAt: db.Now()}); err != nil {
			return u, err
		}
	case err != nil:
		return u, err
	default:
		u.ID = row.ID
		if err := q.SetUserRole(ctx, store.SetUserRoleParams{Role: "owner", ID: u.ID}); err != nil {
			return u, err
		}
	}
	if !row.PasswordHash.Valid && password != "" {
		h, err := auth.HashPassword(password)
		if err != nil {
			return u, err
		}
		if err := q.SetUserPassword(ctx, store.SetUserPasswordParams{PasswordHash: sql.NullString{String: h, Valid: true}, ID: u.ID}); err != nil {
			return u, err
		}
	}
	return u, nil
}

// OwnerHasPassword reports whether the owner can sign in at all.
func OwnerHasPassword(ctx context.Context, d *sql.DB, username string) bool {
	row, err := store.New(d).GetUserPasswordHash(ctx, username)
	return err == nil && row.PasswordHash.Valid
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
	mux.HandleFunc("DELETE /api/posts/{id}", s.requireAuth(s.deletePost))
	mux.HandleFunc("GET /api/posts/{id}/comments", s.requireAuth(s.listComments))
	mux.HandleFunc("POST /api/posts/{id}/comments", s.requireAuth(s.createComment))
	mux.HandleFunc("PUT /api/comments/{id}", s.requireAuth(s.editComment))
	mux.HandleFunc("DELETE /api/comments/{id}", s.requireAuth(s.deleteComment))
	mux.HandleFunc("GET /api/messages", s.requireAuth(s.listMessages))
	mux.HandleFunc("POST /api/messages", s.requireAuth(s.createMessage))
	mux.HandleFunc("DELETE /api/messages/{id}", s.requireAuth(s.deleteMessage))
	mux.HandleFunc("PUT /api/users/{id}/role", s.requireAuth(s.setRole))
	mux.HandleFunc("GET /api/events", s.requireAuth(s.events))
	mux.HandleFunc("POST /api/images", s.requireAuth(s.uploadImage))
	mux.HandleFunc("GET /img/{id}", s.requireAuth(s.serveImage))
	mux.HandleFunc("PUT /api/me/picture", s.requireAuth(s.setPicture))

	// Anything else under /api/ is a 404 in JSON, never the SPA page.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "no such endpoint: "+r.Method+" "+r.URL.Path)
	})

	// Staff.
	mux.HandleFunc("GET /api/invites", s.requireCan(perm.Invite, s.listInvites))
	mux.HandleFunc("POST /api/invites", s.requireCan(perm.Invite, s.createInvite))
	mux.HandleFunc("DELETE /api/invites/{code}", s.requireCan(perm.Invite, s.deleteInvite))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// pageParams reads ?before= and ?limit= for the newest-first feeds.
func pageParams(r *http.Request, defaultLimit, maxLimit int) (before int64, limit int) {
	limit = defaultLimit
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= maxLimit {
		limit = v
	}
	before = int64(1 << 62)
	if v, err := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64); err == nil && v > 0 {
		before = v
	}
	return before, limit
}

func (s *Server) listPosts(w http.ResponseWriter, r *http.Request) {
	before, limit := pageParams(r, 20, 100)
	rows, err := s.q().ListPosts(r.Context(), store.ListPostsParams{Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	viewer, _ := userFrom(r.Context())
	posts := make([]Post, 0, len(rows))
	for _, row := range rows {
		p := Post{
			ID:           row.ID,
			Author:       User{ID: row.AuthorID, Username: row.AuthorUsername, Role: row.AuthorRole, Picture: pictureURL(row.AuthorPictureID)},
			BodyHTML:     row.BodyHtml,
			BodyText:     row.BodyText,
			CreatedAt:    row.CreatedAt,
			EditedAt:     nullInt(row.EditedAt),
			CommentCount: row.CommentCount,
		}
		posts = append(posts, *forViewer(viewer, &p).(*Post))
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

// logged runs fn inside a write transaction, logs the event it returns, commits,
// then broadcasts. fn should write with qtx and return the event payload: the
// resource as it is, without can flags. The log keeps it that way; the reply
// to the actor and every stream get their viewer's flags added.
func (s *Server) logged(w http.ResponseWriter, r *http.Request, kind string, now int64, fn func(qtx *store.Queries) (payload any, status int, err error)) {
	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil) // BEGIN IMMEDIATE via _txlock
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	payload, status, err := fn(store.New(tx))
	if err != nil {
		writeErr(w, status, err.Error())
		return
	}
	ev, err := events.Log(ctx, tx, kind, payload, now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.Hub.Broadcast(ev)
	me, _ := userFrom(ctx)
	writeJSON(w, status, forViewer(me, payload))
}

var errNotFound = errors.New("not found")

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
	s.logged(w, r, "post", p.CreatedAt, func(qtx *store.Queries) (any, int, error) {
		err := qtx.CreatePost(r.Context(), store.CreatePostParams{ID: p.ID, AuthorID: author.ID, BodyHtml: p.BodyHTML, BodyText: p.BodyText, CreatedAt: p.CreatedAt})
		return &p, http.StatusCreated, err
	})
}

// editPost replaces a post's body. The whole sanitised HTML is the unit of
// edit: no diffs, no versions. Only the author may edit; anyone else gets the
// same 404 as a missing post.
func (s *Server) editPost(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	author, _ := userFrom(r.Context())
	p := Post{ID: r.PathValue("id"), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}
	s.logged(w, r, "post", now, func(qtx *store.Queries) (any, int, error) {
		authorID, err := qtx.GetPostAuthor(r.Context(), p.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.EditPost(actor(author), perm.Post{AuthorID: authorID}) {
			return nil, http.StatusForbidden, errors.New("not your post")
		}
		createdAt, err := qtx.EditPost(r.Context(), store.EditPostParams{
			BodyHtml: p.BodyHTML, BodyText: p.BodyText, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: p.ID,
		})
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		p.CreatedAt = createdAt
		n, err := qtx.CountComments(r.Context(), p.ID)
		p.CommentCount = n
		return &p, http.StatusOK, err
	})
}

// actor is the user as perm sees them.
func actor(u User) perm.Actor { return perm.Actor{ID: u.ID, Role: u.Role} }

// deletePost soft-deletes a post (perm.DeletePost says who may). Its comments go with it (they are reached through the post) and
// its images are left to the sweep (images.Sweep), which frees anything no
// live body references. The event carries only the id.
func (s *Server) deletePost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "post_delete", now, func(qtx *store.Queries) (any, int, error) {
		authorID, err := qtx.GetPostAuthor(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.DeletePost(actor(me), perm.Post{AuthorID: authorID}) {
			return nil, http.StatusForbidden, errors.New("not your post")
		}
		if err := qtx.DeletePost(r.Context(), store.DeletePostParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id}, http.StatusOK, nil
	})
}
