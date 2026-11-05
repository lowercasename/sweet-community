package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"sweet/internal/db"
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
		return owners, perm.Actor{}, http.StatusNotFound, errors.New("no such post")
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
		return owners, a, http.StatusNotFound, errors.New("no such post")
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
		c := Comment{
			ID:           row.ID,
			PostID:       row.PostID,
			GroupID:      row.GroupID,
			PostAuthorID: row.PostAuthorID,
			Author:       User{ID: row.AuthorID, Username: row.AuthorUsername, Picture: pictureURL(row.AuthorPictureID)},
			BodyHTML:     row.BodyHtml,
			BodyText:     row.BodyText,
			CreatedAt:    row.CreatedAt,
			EditedAt:     nullInt(row.EditedAt),
		}
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
	c := Comment{ID: id.String(), PostID: postID, Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), CreatedAt: db.Now()}
	s.logged(w, r, "comment", c.CreatedAt, func(qtx *store.Queries) (any, int, error) {
		owners, a, status, err := s.postActor(r, qtx, postID)
		if err != nil {
			return nil, status, err
		}
		if !perm.Write(a) {
			return nil, http.StatusForbidden, errors.New("not allowed")
		}
		c.GroupID, c.PostAuthorID = owners.GroupID, owners.AuthorID
		err = qtx.CreateComment(r.Context(), store.CreateCommentParams{
			ID: c.ID, PostID: postID, AuthorID: author.ID, BodyHtml: c.BodyHTML, BodyText: c.BodyText, CreatedAt: c.CreatedAt,
		})
		return &c, http.StatusCreated, err
	})
}

// commentActor resolves a comment's owners and the viewer in its group; 404 if unseen.
func (s *Server) commentActor(r *http.Request, q *store.Queries, id string) (store.GetCommentOwnersRow, perm.Actor, int, error) {
	owners, err := q.GetCommentOwners(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		return owners, perm.Actor{}, http.StatusNotFound, errors.New("no such comment")
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
		return owners, a, http.StatusNotFound, errors.New("no such comment")
	}
	return owners, a, 0, nil
}

func (s *Server) editComment(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	author, _ := userFrom(r.Context())
	c := Comment{ID: r.PathValue("id"), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}
	s.logged(w, r, "comment", now, func(qtx *store.Queries) (any, int, error) {
		owners, a, status, err := s.commentActor(r, qtx, c.ID)
		if err != nil {
			return nil, status, err
		}
		if !perm.EditComment(a, perm.Comment{AuthorID: owners.AuthorID, PostAuthorID: owners.PostAuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your comment")
		}
		row, err := qtx.EditComment(r.Context(), store.EditCommentParams{
			BodyHtml: c.BodyHTML, BodyText: c.BodyText, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: c.ID,
		})
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		c.PostID, c.GroupID, c.PostAuthorID, c.CreatedAt = row.PostID, owners.GroupID, owners.PostAuthorID, row.CreatedAt
		return &c, http.StatusOK, nil
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
			return nil, http.StatusForbidden, errors.New("not your comment")
		}
		if err := qtx.DeleteComment(r.Context(), store.DeleteCommentParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id, "post_id": owners.PostID, "group_id": owners.GroupID}, http.StatusOK, nil
	})
}
