// Package api holds the HTTP handlers for sessions, invites, posts, comments,
// chat messages and the event stream. Every endpoint except sign-in, join and
// healthz requires a session (see auth.go). SQL is in internal/store (sqlc).
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/mail"
	"sweet/internal/perm"
	"sweet/internal/push"
	"sweet/internal/sanitize"
	"sweet/internal/store"
	"sweet/internal/version"
)

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	// Picture is the URL of the user's picture, or null when the default
	// donut avatar is shown.
	Picture *string `json:"picture"`
}

// Can holds the actions the requesting user may perform on a resource. It is
// computed by perm when the response is built. The frontend shows controls
// based on these flags and holds no rules of its own.
type Can struct {
	Edit   bool `json:"edit"`
	Delete bool `json:"delete"`
	// Report is true for every member but the author.
	Report bool `json:"report"`
	// DeleteByRole is true when Delete is allowed only because of the viewer's role in the item's group. The client
	// marks that Delete with a shield.
	DeleteByRole bool `json:"delete_by_role,omitempty"`
	// SetTopic is set only on a post. The author or the root group's staff may set its topic.
	SetTopic bool `json:"set_topic,omitempty"`
}

// Post is the wire shape of a post. It carries no event sequence, because the
// SSE "id:" line is the sequence and the feed paginates by created_at.
type Post struct {
	ID      string `json:"id"`
	GroupID string `json:"group_id"`
	// TopicID is the id of the post's topic, or null.
	TopicID      *string    `json:"topic_id"`
	Author       User       `json:"author"`
	BodyHTML     string     `json:"body_html"`
	BodyText     string     `json:"body_text"`
	CreatedAt    int64      `json:"created_at"`
	EditedAt     *int64     `json:"edited_at"`
	CommentCount int64      `json:"comment_count"`
	Reactions    []Reaction `json:"reactions"`
	Can          Can        `json:"can"`
}

// forViewer fills in the viewer's can flags on a post, comment, message, group,
// profile or report. a is the viewer's Actor in that resource's group. Any other value is
// returned unchanged. It is used on every response and on the stream.
func forViewer(a perm.Actor, v any, st Settings) any {
	switch x := v.(type) {
	case *Group:
		g := groupFor(a, *x, st)
		return &g
	case *Profile:
		p := profileFor(User{ID: a.ID}, *x)
		return &p
	case *Post:
		p := *x
		pp := perm.Post{AuthorID: p.Author.ID}
		p.Can = Can{
			Edit: perm.EditPost(a, pp), Delete: perm.DeletePost(a, pp), Report: perm.Report(a, pp.AuthorID),
			DeleteByRole: perm.ByRole(a, func(x perm.Actor) bool { return perm.DeletePost(x, pp) }),
			SetTopic:     p.GroupID == perm.Root && perm.SetTopic(a, pp),
		}
		return &p
	case *Comment:
		c := *x
		pc := perm.Comment{AuthorID: c.Author.ID, PostAuthorID: c.PostAuthorID}
		c.Can = Can{
			Edit: perm.EditComment(a, pc), Delete: perm.DeleteComment(a, pc), Report: perm.Report(a, pc.AuthorID),
			DeleteByRole: perm.ByRole(a, func(x perm.Actor) bool { return perm.DeleteComment(x, pc) }),
		}
		return &c
	case *Message:
		m := *x
		// A joined or added line cannot be deleted or reported by anyone.
		if m.Kind == MessageKind {
			pm := perm.Message{AuthorID: m.Author.ID}
			m.Can = Can{
				Delete: perm.DeleteMessage(a, pm), Report: perm.Report(a, m.Author.ID),
				DeleteByRole: perm.ByRole(a, func(x perm.Actor) bool { return perm.DeleteMessage(x, pm) }),
			}
		}
		return &m
	case *Report:
		rp := *x
		rp.Can = ReportCan{Open: !rp.Deleted && perm.OpenReported(a, perm.Group{Kind: rp.GroupKind})}
		return &rp
	}
	return v
}

// groupIDOf returns the id of the group a logged resource belongs to, which is
// used to personalise the response for the actor. It returns "" for a resource
// that is not in a group.
func groupIDOf(v any) string {
	switch x := v.(type) {
	case *Post:
		return x.GroupID
	case *Comment:
		return x.GroupID
	case *Message:
		return x.GroupID
	case *Group:
		return x.ID
	case *Report:
		return x.GroupID
	}
	return ""
}

type Server struct {
	DB  *sql.DB
	Hub *events.Hub
	// Images is nil when no storage is configured. Uploads then return 501.
	Images images.Store
	// Mail sends verification and reset links. BaseURL is the URL they point to.
	Mail    mail.Sender
	BaseURL string
	// SourceURL is where the Source code link at the bottom of Home's feed points. Empty
	// means the public repository. Someone who runs a changed version sets it to their own repository.
	SourceURL string
	// ProxyHops is the number of reverse proxies in front of the server that
	// add the address they saw to X-Forwarded-For. Zero means requests arrive
	// directly and the header is ignored, because any client can send one.
	ProxyHops int
	// Push sends a push notification to a user's devices for a mention or a
	// reply. It is nil when push is not set
	// up. PushKey is the public VAPID key.
	Push    *push.Pusher
	PushKey string
	// PreviewClient fetches the pages and pictures of link previews. Nil means the client from package preview, which
	// refuses internal addresses. Tests set a client that can reach a local test server.
	PreviewClient *http.Client

	limiter loginLimiter
	// mailLimiter rate-limits the endpoints that send a link to any requested address.
	mailLimiter loginLimiter
	// registerLimiter rate-limits attempts to guess invite codes. Like the login
	// limiter, it counts only a failed attempt (a bad code), never a successful
	// registration.
	registerLimiter loginLimiter
	// previewLimiter limits how many pages each user makes the server fetch for link previews. A kept preview is
	// not fetched again and does not count.
	previewLimiter loginLimiter
}

func (s *Server) q() *store.Queries { return store.New(s.DB) }

func nullInt(v sql.NullInt64) *int64 {
	if !v.Valid {
		return nil
	}
	return &v.Int64
}

func (s *Server) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "ok") })

	// Public endpoints for signing in and registering.
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("GET /api/invites/{code}", s.getInvite)
	mux.HandleFunc("POST /api/register", s.register)
	mux.HandleFunc("POST /api/verify", s.verify)
	mux.HandleFunc("POST /api/signin/email", s.requestSignin)
	mux.HandleFunc("POST /api/signin/code", s.signinCode)
	mux.HandleFunc("POST /api/signin/link", s.signinLink)
	mux.HandleFunc("POST /api/signin/address", s.signinAddress)

	// Endpoints that require a session.
	mux.HandleFunc("GET /api/me", s.requireAuth(s.me))
	mux.HandleFunc("GET /api/me/account", s.requireAuth(s.getAccount))
	mux.HandleFunc("PUT /api/me/email", s.requireAuth(s.changeEmail))
	mux.HandleFunc("PUT /api/me/username", s.requireAuth(s.setUsername))
	mux.HandleFunc("PUT /api/me/password", s.requireAuth(s.setPassword))
	mux.HandleFunc("DELETE /api/me/password", s.requireAuth(s.removePassword))
	mux.HandleFunc("GET /api/me/settings", s.requireAuth(s.getMySettings))
	mux.HandleFunc("GET /api/push/key", s.requireAuth(s.pushKey))
	mux.HandleFunc("POST /api/push/subscriptions", s.requireAuth(s.subscribePush))
	mux.HandleFunc("DELETE /api/push/subscriptions", s.requireAuth(s.unsubscribePush))
	mux.HandleFunc("PUT /api/me/settings", s.requireAuth(s.setMySettings))
	mux.HandleFunc("POST /api/logout", s.requireAuth(s.logout))
	mux.HandleFunc("POST /api/logout-all", s.requireAuth(s.logoutAll))
	mux.HandleFunc("GET /api/users", s.requireAuth(s.listUsers))
	mux.HandleFunc("DELETE /api/users/{id}", s.requireAuth(s.removeUser))
	mux.HandleFunc("GET /api/users/{name}", s.requireAuth(s.getProfile))
	mux.HandleFunc("GET /api/users/{name}/posts", s.requireAuth(s.listUserPosts))
	mux.HandleFunc("PUT /api/me/bio", s.requireAuth(s.setBio))
	mux.HandleFunc("GET /api/groups", s.requireAuth(s.listGroups))
	mux.HandleFunc("POST /api/groups", s.requireAuth(s.createGroup))
	mux.HandleFunc("GET /api/groups/{gid}", s.requireGroup(s.getGroup))
	mux.HandleFunc("PUT /api/groups/{gid}", s.requireGroup(s.updateGroup))
	mux.HandleFunc("PUT /api/groups/{gid}/picture", s.requireGroup(s.setGroupPicture))
	mux.HandleFunc("DELETE /api/groups/{gid}", s.requireGroup(s.deleteGroup))
	mux.HandleFunc("GET /api/groups/{gid}/members", s.requireGroup(s.listMembers))
	mux.HandleFunc("POST /api/groups/{gid}/members", s.requireGroup(s.addMember))
	mux.HandleFunc("PUT /api/groups/{gid}/members/{uid}", s.requireGroup(s.setMemberRole))
	mux.HandleFunc("DELETE /api/groups/{gid}/members/{uid}", s.requireGroup(s.removeMember))
	mux.HandleFunc("GET /api/groups/{gid}/posts", s.requireGroup(s.listPosts))
	mux.HandleFunc("POST /api/groups/{gid}/posts", s.requireGroup(s.createPost))
	mux.HandleFunc("GET /api/groups/{gid}/messages", s.requireGroup(s.listMessages))
	mux.HandleFunc("POST /api/groups/{gid}/messages", s.requireGroup(s.createMessage))
	mux.HandleFunc("GET /api/posts/{id}", s.requireAuth(s.getPost))
	mux.HandleFunc("GET /api/search", s.requireAuth(s.search))
	s.previewLimiter.every, s.previewLimiter.burst = 2*time.Second, 30
	mux.HandleFunc("GET /api/previews", s.requireAuth(s.linkPreview))
	mux.HandleFunc("PUT /api/posts/{id}", s.requireAuth(s.editPost))
	mux.HandleFunc("PUT /api/posts/{id}/topic", s.requireAuth(s.setPostTopic))
	mux.HandleFunc("GET /api/topics", s.requireAuth(s.listTopics))
	mux.HandleFunc("POST /api/topics", s.requireRoot(perm.ManageTopics, s.createTopic))
	mux.HandleFunc("PUT /api/topics/{id}", s.requireRoot(perm.ManageTopics, s.updateTopic))
	mux.HandleFunc("DELETE /api/topics/{id}", s.requireRoot(perm.ManageTopics, s.deleteTopic))
	mux.HandleFunc("PUT /api/topics/{id}/follow", s.requireAuth(s.followTopic))
	mux.HandleFunc("DELETE /api/topics/{id}/follow", s.requireAuth(s.unfollowTopic))
	mux.HandleFunc("DELETE /api/posts/{id}", s.requireAuth(s.deletePost))
	mux.HandleFunc("GET /api/posts/{id}/comments", s.requireAuth(s.listComments))
	mux.HandleFunc("POST /api/posts/{id}/comments", s.requireAuth(s.createComment))
	mux.HandleFunc("PUT /api/comments/{id}", s.requireAuth(s.editComment))
	mux.HandleFunc("DELETE /api/comments/{id}", s.requireAuth(s.deleteComment))
	mux.HandleFunc("DELETE /api/messages/{id}", s.requireAuth(s.deleteMessage))
	mux.HandleFunc("GET /api/me/reactions", s.requireAuth(s.frequentReactions))
	mux.HandleFunc("PUT /api/posts/{id}/reactions", s.requireAuth(s.react("post")))
	mux.HandleFunc("PUT /api/comments/{id}/reactions", s.requireAuth(s.react("comment")))
	mux.HandleFunc("PUT /api/messages/{id}/reactions", s.requireAuth(s.react("message")))
	mux.HandleFunc("GET /api/events", s.requireAuth(s.events))
	mux.HandleFunc("PUT /api/notifications/read", s.requireAuth(s.readAllNotifications))
	mux.HandleFunc("GET /api/posts/{id}/notifications", s.requireAuth(s.getPostNotificationPreference))
	mux.HandleFunc("PUT /api/posts/{id}/notifications", s.requireAuth(s.setPostNotificationPreference))
	mux.HandleFunc("GET /api/groups/{gid}/notifications", s.requireGroup(s.getRoomNotificationPreference))
	mux.HandleFunc("PUT /api/groups/{gid}/notifications", s.requireGroup(s.setRoomNotificationPreference))
	mux.HandleFunc("GET /api/notifications", s.requireAuth(s.listNotifications))
	mux.HandleFunc("DELETE /api/notifications", s.requireAuth(s.clearNotifications))
	mux.HandleFunc("PUT /api/notifications/{id}/read", s.requireAuth(s.readNotification))
	mux.HandleFunc("GET /api/markers", s.requireAuth(s.listMarkers))
	mux.HandleFunc("PUT /api/markers/{stream}", s.requireAuth(s.setMarker))
	mux.HandleFunc("GET /api/settings", s.getSettings) // public, because the sign-in page shows the community's name
	mux.HandleFunc("POST /api/setup", s.setup)
	mux.HandleFunc("GET /api/version", s.requireAuth(s.getVersion))
	mux.HandleFunc("GET /api/rules", s.requireAuth(s.getText(rulesText)))
	mux.HandleFunc("PUT /api/rules", s.requireRoot(perm.ManageRules, s.setText(rulesText)))
	mux.HandleFunc("GET /api/welcome", s.requireAuth(s.getText(welcomeText)))
	mux.HandleFunc("PUT /api/welcome", s.requireRoot(perm.ManageWelcome, s.setText(welcomeText)))
	mux.HandleFunc("POST /api/reports", s.requireAuth(s.createReport))
	mux.HandleFunc("GET /api/reports", s.requireRoot(perm.HandleReports, s.listReports))
	mux.HandleFunc("POST /api/reports/{kind}/{id}/{action}", s.requireRoot(perm.HandleReports, s.closeReport))
	mux.HandleFunc("PUT /api/settings", s.requireRoot(perm.ManageInstance, s.setSettings))
	mux.HandleFunc("POST /api/images", s.requireAuth(s.uploadImage))
	mux.HandleFunc("GET /img/{id}", s.requireAuth(s.serveImage))
	mux.HandleFunc("PUT /api/me/picture", s.requireAuth(s.setPicture))

	// Any other path under /api/ returns a JSON 404, never the SPA page.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeErr(w, http.StatusNotFound, "No such endpoint: "+r.Method+" "+r.URL.Path)
	})

	// Invite endpoints for the root group's staff. An invite link adds a user to the root group.
	mux.HandleFunc("GET /api/invites", s.requireRoot(perm.Invite, s.listInvites))
	mux.HandleFunc("POST /api/invites", s.requireRoot(perm.Invite, s.createInvite))
	mux.HandleFunc("DELETE /api/invites/{code}", s.requireRoot(perm.Invite, s.deleteInvite))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	// The client shows an error message as it is. A 500 carries an internal error, such as a SQLite or S3 message,
	// so it is logged and the response says only that something went wrong.
	if status == http.StatusInternalServerError {
		log.Printf("server error: %s", msg)
		msg = ServerErrorMessage
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

// ServerErrorMessage is the whole body of every 500 response.
const ServerErrorMessage = "Something went wrong on the server. Try again in a moment."

func (s *Server) listPosts(w http.ResponseWriter, r *http.Request) {
	g, a := groupFrom(r.Context())
	before, limit, err := pageParams(r, 20, 100)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	// ?topic= filters the community's feed to one topic.
	var topic any
	if t := r.URL.Query().Get("topic"); t != "" {
		topic = t
	}
	rows, err := s.q().ListPosts(r.Context(), store.ListPostsParams{GroupID: g.ID, Before: before.CreatedAt, BeforeID: before.ID, TopicID: topic, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	posts := make([]Post, 0, len(rows))
	for _, row := range rows {
		p := wirePost(store.GetPostRow(row))
		posts = append(posts, *forViewer(a, &p, Settings{}).(*Post))
	}
	posts, next := page(posts, limit, func(p Post) pageCursor { return pageCursor{p.CreatedAt, p.ID} })
	writeJSON(w, http.StatusOK, map[string]any{"posts": posts, "next_before": next})
}

// getPost returns one post by id. The post page
// fetches it when the feed it belongs to is not loaded. As on every endpoint,
// the response is 404 when the viewer is not a member of the post's group.
func (s *Server) getPost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	_, a, status, err := s.postActor(r, s.q(), id)
	if err != nil {
		writeErr(w, status, err.Error())
		return
	}
	row, err := s.q().GetPost(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	p := wirePost(row)
	writeJSON(w, http.StatusOK, forViewer(a, &p, Settings{}))
}

// readBody decodes {body_html} and sanitises it. When the body is malformed
// or empty, it writes the 400 response itself and returns ok false.
func readBody(w http.ResponseWriter, r *http.Request) (clean string, ok bool) {
	var in struct {
		BodyHTML string `json:"body_html"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return "", false
	}
	clean = sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		writeErr(w, http.StatusBadRequest, "The body is empty")
		return "", false
	}
	return clean, true
}

// readMessageBody is readBody with the message's optional reply_to.
func readMessageBody(w http.ResponseWriter, r *http.Request) (clean string, replyTo *string, ok bool) {
	var in struct {
		BodyHTML string  `json:"body_html"`
		ReplyTo  *string `json:"reply_to"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return "", nil, false
	}
	clean = sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		writeErr(w, http.StatusBadRequest, "The body is empty")
		return "", nil, false
	}
	if in.ReplyTo != nil && *in.ReplyTo == "" {
		in.ReplyTo = nil
	}
	return clean, in.ReplyTo, true
}

// readPostBody is readBody with the post's optional topic_id.
func readPostBody(w http.ResponseWriter, r *http.Request) (clean string, topicID *string, ok bool) {
	var in struct {
		BodyHTML string  `json:"body_html"`
		TopicID  *string `json:"topic_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return "", nil, false
	}
	clean = sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		writeErr(w, http.StatusBadRequest, "The body is empty")
		return "", nil, false
	}
	if in.TopicID != nil && *in.TopicID == "" {
		in.TopicID = nil
	}
	return clean, in.TopicID, true
}

// logged runs fn inside a write transaction, logs the one event fn returns,
// commits, notifies subscribers, and responds with the payload personalised
// for the actor. fn returns the resource without can flags. The log stores it
// that way and every reader adds their own view.
func (s *Server) logged(w http.ResponseWriter, r *http.Request, kind string, now int64, fn func(qtx *store.Queries) (payload any, status int, err error)) {
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		payload, status, err := fn(qtx)
		if err != nil {
			return nil, nil, status, err
		}
		return []events.Entry{{Kind: kind, Payload: payload}}, payload, status, nil
	})
}

// loggedMany is logged for a write that produces several events, such as a
// new group and its memberships. It rechecks the session and staff rule before writing.
// Entries may be empty for writes that have no event. The response is personalised.
func (s *Server) loggedMany(w http.ResponseWriter, r *http.Request, now int64, fn func(qtx *store.Queries) (entries []events.Entry, response any, status int, err error)) {
	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil) // BEGIN IMMEDIATE via _txlock
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	qtx := store.New(tx)
	if status, err := s.authorizeWrite(r, qtx); err != nil {
		writeErr(w, status, err.Error())
		return
	}
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
	// Look up the actor's own view of the written resource while the
	// transaction is open.
	a := perm.Actor{ID: me.ID}
	st := Settings{}
	if gid := groupIDOf(response); gid != "" {
		if a, err = actorIn(ctx, qtx, me, gid); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if st, err = settingsOf(ctx, qtx); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(logged) > 0 {
		s.Hub.Notify()
	}
	var told []json.RawMessage
	for _, ev := range logged {
		if ev.Kind == "notification" {
			told = append(told, ev.Payload)
		}
	}
	if len(told) > 0 {
		s.pushAfterCommit(told, st.Name)
	}
	if status == http.StatusNoContent {
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, forViewer(a, response, st))
}

var errNotFound = errors.New("Not found")

func (s *Server) createPost(w http.ResponseWriter, r *http.Request) {
	clean, topicID, ok := readPostBody(w, r)
	if !ok {
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	author, _ := userFrom(r.Context())
	now := db.Now()
	// The post, a notification to each user it mentions, and a notification to each follower of its topic are written in one transaction.
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		g, a, status, err := s.groupActor(r, qtx)
		if err != nil {
			return nil, nil, status, err
		}
		if !perm.Write(a) {
			return nil, nil, http.StatusForbidden, errors.New("Not allowed")
		}
		if g.Mode == perm.ModeChat {
			return nil, nil, http.StatusForbidden, errors.New("This room has no posts")
		}
		// Only the community's feed has topics.
		if topicID != nil && g.ID != perm.Root {
			return nil, nil, http.StatusBadRequest, errors.New("Only posts on the community's feed have topics")
		}

		if status, err := topicExists(r, qtx, topicID); err != nil {
			return nil, nil, status, err
		}
		topic := sql.NullString{}
		if topicID != nil {
			topic = sql.NullString{String: *topicID, Valid: true}
		}
		text := sanitize.Text(clean)
		if err := qtx.CreatePost(r.Context(), store.CreatePostParams{ID: id.String(), GroupID: g.ID, AuthorID: author.ID, TopicID: topic, BodyHtml: clean, BodyText: text, CreatedAt: now}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if status, err := recordUses(r.Context(), qtx, "post", id.String(), author.ID, clean); err != nil {
			return nil, nil, status, err
		}
		row, err := qtx.GetPost(r.Context(), id.String())
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		p := wirePost(row)
		pid := p.ID
		entries := []events.Entry{{Kind: "post", Payload: &p}}
		// The author gets a read position for the post's comments, so other users' comments show as unread to them.
		// The post event makes the author's clients fetch their markers again, so no marker event is sent.
		if err := qtx.SetMarker(r.Context(), store.SetMarkerParams{UserID: author.ID, Stream: "post:" + pid, ReadAt: now}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		told, err := mentionEvents(r, qtx, clean, author.ID, g.ID, &pid, nil, now, "")
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries = append(entries, told...)
		if topic.Valid {
			followers, err := tellFollowers(r, qtx, topic.String, pid, author.ID, now, sanitize.Mentions(clean)...)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, followers...)
		}
		return entries, &p, http.StatusCreated, nil
	})
}

func (s *Server) editPost(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	author, _ := userFrom(r.Context())
	id := r.PathValue("id")
	s.logged(w, r, "post", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("No such post")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, author, owners.GroupID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, http.StatusNotFound, errors.New("No such post")
		}
		if !perm.EditPost(a, perm.Post{AuthorID: owners.AuthorID}) {
			return nil, http.StatusForbidden, errors.New("Not your post")
		}
		text := sanitize.Text(clean)
		if err := qtx.EditPost(r.Context(), store.EditPostParams{
			BodyHtml: clean, BodyText: text, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id,
		}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if status, err := recordUses(r.Context(), qtx, "post", id, author.ID, clean); err != nil {
			return nil, status, err
		}
		// An edit does not create new mention notifications.
		row, err := qtx.GetPost(r.Context(), id)
		p := wirePost(row)
		return &p, http.StatusOK, err
	})
}

// deletePost deletes a post. perm.DeletePost decides who may. removePost does the deletion. The event carries the
// post's id and group id.
func (s *Server) deletePost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("No such post")
		}
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, nil, http.StatusNotFound, errors.New("No such post")
		}
		if !perm.DeletePost(a, perm.Post{AuthorID: owners.AuthorID}) {
			return nil, nil, http.StatusForbidden, errors.New("Not your post")
		}
		gone, err := removePost(r.Context(), qtx, id, owners.GroupID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return gone, gone[0].Payload, http.StatusOK, nil
	})
}

// removePost deletes a live post and its comments and empties their text, and returns the post_delete event. The
// rows stay, so the rows that point at them stay valid. Its images are left for the sweep (images.Sweep). The delete
// handler, a report's Delete action and the removal of a user all use it.
func removePost(ctx context.Context, qtx *store.Queries, id, groupID string, now int64) ([]events.Entry, error) {
	at := sql.NullInt64{Int64: now, Valid: true}
	if err := qtx.DeletePost(ctx, store.DeletePostParams{DeletedAt: at, ID: id}); err != nil {
		return nil, err
	}
	if err := qtx.DeletePostComments(ctx, store.DeletePostCommentsParams{DeletedAt: at, PostID: id}); err != nil {
		return nil, err
	}
	if err := qtx.ForgetPostCommentEvents(ctx, id); err != nil {
		return nil, err
	}
	if err := forgetReactions(ctx, qtx, id); err != nil {
		return nil, err
	}
	return []events.Entry{{Kind: "post_delete", Payload: map[string]string{"id": id, "group_id": groupID}}}, nil
}

// DefaultSourceURL is the public repository, where the Source code link points unless the server names another.
const DefaultSourceURL = "https://github.com/lowercasename/sweet-community"

// getVersion is `GET /api/version`, for signed-in users only, so the release is not shown to anyone scanning for
// old versions. It names the release the binary was built from, the build's own identifier, which open tabs use to
// reload, and the address of the source code. The line at the
// bottom of Home's feed shows the release and links to the source.
func (s *Server) getVersion(w http.ResponseWriter, r *http.Request) {
	source := s.SourceURL
	if source == "" {
		source = DefaultSourceURL
	}
	writeJSON(w, http.StatusOK, map[string]string{"release": version.Release(), "build": version.Of(), "source_url": source})
}
