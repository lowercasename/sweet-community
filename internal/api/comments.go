package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"sweet/internal/db"
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
		row, err := qtx.EditOwnComment(r.Context(), store.EditOwnCommentParams{
			BodyHtml: c.BodyHTML, BodyText: c.BodyText, EditedAt: sql.NullInt64{Int64: now, Valid: true}, ID: c.ID, AuthorID: author.ID,
		})
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such comment")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		c.PostID, c.CreatedAt = row.PostID, row.CreatedAt
		return &c, http.StatusOK, nil
	})
}
