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
// the body; there is no tree.
type Comment struct {
	ID        string `json:"id"`
	PostID    string `json:"post_id"`
	Author    User   `json:"author"`
	BodyHTML  string `json:"body_html"`
	BodyText  string `json:"body_text"`
	CreatedAt int64  `json:"created_at"`
	EditedAt  *int64 `json:"edited_at"`
}

func (s *Server) postExists(r *http.Request, id string) (bool, error) {
	n, err := s.q().PostExists(r.Context(), id)
	return n > 0, err
}

// listComments returns every comment on a post, oldest first. Threads are
// small; there is no paging.
func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	if ok, err := s.postExists(r, postID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	} else if !ok {
		writeErr(w, http.StatusNotFound, "no such post")
		return
	}
	rows, err := s.q().ListComments(r.Context(), postID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, Comment{
			ID:        row.ID,
			PostID:    row.PostID,
			Author:    User{ID: row.AuthorID, Username: row.AuthorUsername, Role: row.AuthorRole, Picture: pictureURL(row.AuthorPictureID)},
			BodyHTML:  row.BodyHtml,
			BodyText:  row.BodyText,
			CreatedAt: row.CreatedAt,
			EditedAt:  nullInt(row.EditedAt),
		})
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
		if n, err := qtx.PostExists(r.Context(), postID); err != nil {
			return nil, http.StatusInternalServerError, err
		} else if n == 0 {
			return nil, http.StatusNotFound, errors.New("no such post")
		}
		err := qtx.CreateComment(r.Context(), store.CreateCommentParams{
			ID: c.ID, PostID: postID, AuthorID: author.ID, BodyHtml: c.BodyHTML, BodyText: c.BodyText, CreatedAt: c.CreatedAt,
		})
		return &c, http.StatusCreated, err
	})
}

// editComment: author-only, same 404 for "not yours" and "not there".
func (s *Server) editComment(w http.ResponseWriter, r *http.Request) {
	clean, ok := readBody(w, r)
	if !ok {
		return
	}
	now := db.Now()
	author, _ := userFrom(r.Context())
	c := Comment{ID: r.PathValue("id"), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), EditedAt: &now}
	s.logged(w, r, "comment_edit", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetCommentOwners(r.Context(), c.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such comment")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.EditComment(actor(author), perm.Comment{AuthorID: owners.AuthorID, PostAuthorID: owners.PostAuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your comment")
		}
		row, err := qtx.EditComment(r.Context(), store.EditCommentParams{
			BodyHtml: c.BodyHTML, BodyText: c.BodyText, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: c.ID,
		})
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		c.PostID, c.CreatedAt = row.PostID, row.CreatedAt
		return &c, http.StatusOK, nil
	})
}

// deleteComment soft-deletes a comment (perm.DeleteComment says who may).
// The event carries both ids so pages can drop it and lower the post's count.
func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "comment_delete", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetCommentOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such comment")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.DeleteComment(actor(me), perm.Comment{AuthorID: owners.AuthorID, PostAuthorID: owners.PostAuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your comment")
		}
		if err := qtx.DeleteComment(r.Context(), store.DeleteCommentParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id, "post_id": owners.PostID}, http.StatusOK, nil
	})
}
