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
	// Picture is the avatar's url, or null for the donut.
	Picture *string `json:"picture"`
}

// Can is what the requesting user may do to a resource, computed by perm on
// the way out. The frontend shows controls from these and holds no rules.
type Can struct {
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
}

// Post is the wire shape. It carries no event sequence: the SSE "id:" line
// is the sequence, and the feed paginates by created_at.
type Post struct {
	ID           string `json:"id"`
	GroupID      string `json:"group_id"`
	Author       User   `json:"author"`
	BodyHTML     string `json:"body_html"`
	BodyText     string `json:"body_text"`
	CreatedAt    int64  `json:"created_at"`
	EditedAt     *int64 `json:"edited_at"`
	CommentCount int64  `json:"comment_count"`
	Can          Can    `json:"can"`
}

// forViewer fills in the viewer's can flags on a post, comment or message,
// given the viewer as perm sees them in that thing's group. Anything else
// passes through. Used on every response and on the stream.
func forViewer(a perm.Actor, v any) any {
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

// groupIDOf is the group a logged resource belongs to, for personalising a
// reply to the actor; "" for things that are not in a group.
func groupIDOf(v any) string {
	switch x := v.(type) {
	case *Post:
		return x.GroupID
	case *Comment:
		return x.GroupID
	case *Message:
		return x.GroupID
	}
	return ""
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
	u := User{Username: username}
	now := db.Now()
	row, err := q.GetUserByUsername(ctx, username)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		id, err := uuid.NewV7()
		if err != nil {
			return u, err
		}
		u.ID = id.String()
		if err := q.CreateUser(ctx, store.CreateUserParams{ID: u.ID, Username: u.Username, CreatedAt: now}); err != nil {
			return u, err
		}
	case err != nil:
		return u, err
	default:
		u.ID = row.ID
	}
	// The owner is the root group's owner (architecture.md, Groups).
	if _, err := q.GetMembership(ctx, store.GetMembershipParams{GroupID: perm.Root, UserID: u.ID}); errors.Is(err, sql.ErrNoRows) {
		if err := q.CreateMembership(ctx, store.CreateMembershipParams{GroupID: perm.Root, UserID: u.ID, Role: perm.Owner, JoinedAt: now}); err != nil {
			return u, err
		}
	} else if err != nil {
		return u, err
	} else if err := q.SetMembershipRole(ctx, store.SetMembershipRoleParams{Role: perm.Owner, GroupID: perm.Root, UserID: u.ID}); err != nil {
		return u, err
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
	mux.HandleFunc("GET /api/groups", s.requireAuth(s.listGroups))
	mux.HandleFunc("POST /api/groups", s.requireAuth(s.createGroup))
	mux.HandleFunc("GET /api/groups/{gid}", s.requireGroup(s.getGroup))
	mux.HandleFunc("PUT /api/groups/{gid}", s.requireGroup(s.renameGroup))
	mux.HandleFunc("DELETE /api/groups/{gid}", s.requireGroup(s.deleteGroup))
	mux.HandleFunc("GET /api/groups/{gid}/members", s.requireGroup(s.listMembers))
	mux.HandleFunc("POST /api/groups/{gid}/members", s.requireGroup(s.addMember))
	mux.HandleFunc("PUT /api/groups/{gid}/members/{uid}", s.requireGroup(s.setMemberRole))
	mux.HandleFunc("DELETE /api/groups/{gid}/members/{uid}", s.requireGroup(s.removeMember))
	mux.HandleFunc("GET /api/groups/{gid}/posts", s.requireGroup(s.listPosts))
	mux.HandleFunc("POST /api/groups/{gid}/posts", s.requireGroup(s.createPost))
	mux.HandleFunc("GET /api/groups/{gid}/messages", s.requireGroup(s.listMessages))
	mux.HandleFunc("POST /api/groups/{gid}/messages", s.requireGroup(s.createMessage))
	mux.HandleFunc("PUT /api/posts/{id}", s.requireAuth(s.editPost))
	mux.HandleFunc("DELETE /api/posts/{id}", s.requireAuth(s.deletePost))
	mux.HandleFunc("GET /api/posts/{id}/comments", s.requireAuth(s.listComments))
	mux.HandleFunc("POST /api/posts/{id}/comments", s.requireAuth(s.createComment))
	mux.HandleFunc("PUT /api/comments/{id}", s.requireAuth(s.editComment))
	mux.HandleFunc("DELETE /api/comments/{id}", s.requireAuth(s.deleteComment))
	mux.HandleFunc("DELETE /api/messages/{id}", s.requireAuth(s.deleteMessage))
	mux.HandleFunc("GET /api/events", s.requireAuth(s.events))
	mux.HandleFunc("POST /api/images", s.requireAuth(s.uploadImage))
	mux.HandleFunc("GET /img/{id}", s.requireAuth(s.serveImage))
	mux.HandleFunc("PUT /api/me/picture", s.requireAuth(s.setPicture))

	// Anything else under /api/ is a 404 in JSON, never the SPA page.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "no such endpoint: "+r.Method+" "+r.URL.Path)
	})

	// The root group's staff: an invite link adds someone to the root group.
	mux.HandleFunc("GET /api/invites", s.requireRoot(perm.AddMembers, s.listInvites))
	mux.HandleFunc("POST /api/invites", s.requireRoot(perm.AddMembers, s.createInvite))
	mux.HandleFunc("DELETE /api/invites/{code}", s.requireRoot(perm.AddMembers, s.deleteInvite))
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
	g, a := groupFrom(r.Context())
	before, limit := pageParams(r, 20, 100)
	rows, err := s.q().ListPosts(r.Context(), store.ListPostsParams{GroupID: g.ID, Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	posts := make([]Post, 0, len(rows))
	for _, row := range rows {
		p := Post{
			ID:           row.ID,
			GroupID:      row.GroupID,
			Author:       User{ID: row.AuthorID, Username: row.AuthorUsername, Picture: pictureURL(row.AuthorPictureID)},
			BodyHTML:     row.BodyHtml,
			BodyText:     row.BodyText,
			CreatedAt:    row.CreatedAt,
			EditedAt:     nullInt(row.EditedAt),
			CommentCount: row.CommentCount,
		}
		posts = append(posts, *forViewer(a, &p).(*Post))
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

// logged runs fn inside a write transaction, logs the one event it returns,
// commits, broadcasts, and replies with the payload personalised for the
// actor. fn returns the resource as it is, without can flags; the log keeps
// it that way and every reader adds their own view.
func (s *Server) logged(w http.ResponseWriter, r *http.Request, kind string, now int64, fn func(qtx *store.Queries) (payload any, status int, err error)) {
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		payload, status, err := fn(qtx)
		if err != nil {
			return nil, nil, status, err
		}
		return []events.Entry{{Kind: kind, Payload: payload}}, payload, status, nil
	})
}

// loggedMany is logged for a write that is several events (a new group and
// its memberships). The reply is the given response, personalised.
func (s *Server) loggedMany(w http.ResponseWriter, r *http.Request, now int64, fn func(qtx *store.Queries) (entries []events.Entry, response any, status int, err error)) {
	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil) // BEGIN IMMEDIATE via _txlock
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	qtx := store.New(tx)
	entries, response, status, err := fn(qtx)
	if err != nil {
		writeErr(w, status, err.Error())
		return
	}
	logged := make([]events.Event, 0, len(entries))
	for _, en := range entries {
		ev, err := events.Log(ctx, tx, en.Kind, en.Payload, now)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		logged = append(logged, ev)
	}
	me, _ := userFrom(ctx)
	// The actor's own view of what they wrote, looked up while the tx is open.
	a := perm.Actor{ID: me.ID}
	if gid := groupIDOf(response); gid != "" {
		if a, err = actorIn(ctx, qtx, me, gid); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, ev := range logged {
		s.Hub.Broadcast(ev)
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, forViewer(a, response))
}

var errNotFound = errors.New("not found")

func (s *Server) createPost(w http.ResponseWriter, r *http.Request) {
	g, a := groupFrom(r.Context())
	if !perm.Write(a) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
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
	p := Post{ID: id.String(), GroupID: g.ID, Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), CreatedAt: db.Now()}
	s.logged(w, r, "post", p.CreatedAt, func(qtx *store.Queries) (any, int, error) {
		err := qtx.CreatePost(r.Context(), store.CreatePostParams{ID: p.ID, GroupID: g.ID, AuthorID: author.ID, BodyHtml: p.BodyHTML, BodyText: p.BodyText, CreatedAt: p.CreatedAt})
		return &p, http.StatusCreated, err
	})
}

func (s *Server) editPost(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	author, _ := userFrom(r.Context())
	p := Post{ID: r.PathValue("id"), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}
	s.logged(w, r, "post", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), p.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, author, owners.GroupID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if !perm.EditPost(a, perm.Post{AuthorID: owners.AuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your post")
		}
		createdAt, err := qtx.EditPost(r.Context(), store.EditPostParams{
			BodyHtml: p.BodyHTML, BodyText: p.BodyText, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: p.ID,
		})
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		p.GroupID, p.CreatedAt = owners.GroupID, createdAt
		n, err := qtx.CountComments(r.Context(), p.ID)
		p.CommentCount = n
		return &p, http.StatusOK, err
	})
}

// deletePost soft-deletes a post (perm.DeletePost says who may). Its comments
// go with it (they are reached through the post) and its images are left to
// the sweep (images.Sweep). The event carries the id and the group.
func (s *Server) deletePost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "post_delete", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		if !perm.DeletePost(a, perm.Post{AuthorID: owners.AuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your post")
		}
		if err := qtx.DeletePost(r.Context(), store.DeletePostParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id, "group_id": owners.GroupID}, http.StatusOK, nil
	})
}
