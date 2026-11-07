package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// Comment is one flat reply under a post. A quote-reply is a blockquote in
// the body; there is no tree. It reaches its group through its post.
type Comment struct {
	ID      string `json:"id"`
	PostID  string `json:"post_id"`
	GroupID string `json:"group_id"`
	// PostAuthorID is an ownership fact perm needs: the post's author may delete any comment on it.
	PostAuthorID string `json:"post_author_id"`
	Author       User   `json:"author"`
	BodyHTML     string `json:"body_html"`
	BodyText     string `json:"body_text"`
	CreatedAt    int64  `json:"created_at"`
	EditedAt     *int64 `json:"edited_at"`
	Can          Can    `json:"can"`
}

// postActor resolves a post's owners and the viewer as perm sees them in its
// group. A post the viewer cannot see does not exist to them: 404.
func (s *Server) postActor(r *http.Request, q *store.Queries, postID string) (store.GetPostOwnersRow, perm.Actor, int, error) {
	owners, err := q.GetPostOwners(r.Context(), postID)
	if errors.Is(err, sql.ErrNoRows) {
		return owners, perm.Actor{}, http.StatusNotFound, errors.New("No such post")
	}
	if err != nil {
		return owners, perm.Actor{}, http.StatusInternalServerError, err
	}
	me, _ := userFrom(r.Context())
	a, err := actorIn(r.Context(), q, me, owners.GroupID)
	if err != nil {
		return owners, a, http.StatusInternalServerError, err
	}
	if !perm.CanSee(a) {
		return owners, a, http.StatusNotFound, errors.New("No such post")
	}
	return owners, a, 0, nil
}

// listComments returns every comment on a post, oldest first. Threads are
// small; there is no paging.
func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	_, a, status, err := s.postActor(r, s.q(), postID)
	if err != nil {
		writeErr(w, status, err.Error())
		return
	}
	rows, err := s.q().ListComments(r.Context(), postID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		c := wireComment(store.GetCommentRow(row))
		out = append(out, *forViewer(a, &c, Settings{}).(*Comment))
	}
	writeJSON(w, http.StatusOK, map[string]any{"comments": out})
}

func (s *Server) createComment(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
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
	now := db.Now()
	// The comment, then its notification to the post's author (architecture.md, Notifications), in one transaction.
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		owners, a, status, err := s.postActor(r, qtx, postID)
		if err != nil {
			return nil, nil, status, err
		}
		if !perm.Write(a) {
			return nil, nil, http.StatusForbidden, errors.New("Not allowed")
		}
		if err := qtx.CreateComment(r.Context(), store.CreateCommentParams{
			ID: id.String(), PostID: postID, AuthorID: author.ID, BodyHtml: clean, BodyText: sanitize.Text(clean), CreatedAt: now,
		}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetComment(r.Context(), id.String())
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		c := wireComment(row)
		entries := []events.Entry{{Kind: "comment", Payload: &c}}
		told, err := notify(r, qtx, NotifyComment, owners.AuthorID, author.ID, owners.GroupID, &postID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if told != nil {
			entries = append(entries, *told)
		}
		// Mentions in the comment reach their people too; the post's author, already told of the comment, once only.
		skip := ""
		if told != nil {
			skip = owners.AuthorID
		}
		mentioned, err := mentionEvents(r, qtx, clean, author.ID, owners.GroupID, &postID, now, skip)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return append(entries, mentioned...), &c, http.StatusCreated, nil
	})
}

// commentActor resolves a comment's owners and the viewer in its group; 404 if unseen.
func (s *Server) commentActor(r *http.Request, q *store.Queries, id string) (store.GetCommentOwnersRow, perm.Actor, int, error) {
	owners, err := q.GetCommentOwners(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		return owners, perm.Actor{}, http.StatusNotFound, errors.New("No such comment")
	}
	if err != nil {
		return owners, perm.Actor{}, http.StatusInternalServerError, err
	}
	me, _ := userFrom(r.Context())
	a, err := actorIn(r.Context(), q, me, owners.GroupID)
	if err != nil {
		return owners, a, http.StatusInternalServerError, err
	}
	if !perm.CanSee(a) {
		return owners, a, http.StatusNotFound, errors.New("No such comment")
	}
	return owners, a, 0, nil
}

func (s *Server) editComment(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	id := r.PathValue("id")
	s.logged(w, r, "comment", now, func(qtx *store.Queries) (any, int, error) {
		owners, a, status, err := s.commentActor(r, qtx, id)
		if err != nil {
			return nil, status, err
		}
		if !perm.EditComment(a, perm.Comment{AuthorID: owners.AuthorID, PostAuthorID: owners.PostAuthorID}) {
			return nil, http.StatusForbidden, errors.New("Not your comment")
		}
		if err := qtx.EditComment(r.Context(), store.EditCommentParams{
			BodyHtml: clean, BodyText: sanitize.Text(clean), EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id,
		}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetComment(r.Context(), id)
		c := wireComment(row)
		return &c, http.StatusOK, err
	})
}

// deleteComment soft-deletes a comment (perm.DeleteComment says who may).
// The event carries the ids so pages can drop it and lower the post's count.
func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	now := db.Now()
	s.logged(w, r, "comment_delete", now, func(qtx *store.Queries) (any, int, error) {
		owners, a, status, err := s.commentActor(r, qtx, id)
		if err != nil {
			return nil, status, err
		}
		if !perm.DeleteComment(a, perm.Comment{AuthorID: owners.AuthorID, PostAuthorID: owners.PostAuthorID}) {
			return nil, http.StatusForbidden, errors.New("Not your comment")
		}
		if err := qtx.DeleteComment(r.Context(), store.DeleteCommentParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id, "post_id": owners.PostID, "group_id": owners.GroupID}, http.StatusOK, nil
	})
}
