package api

import (
	"net/http"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// Message is one chat message in the instance's single room.
type Message struct {
	ID        string `json:"id"`
	Author    User   `json:"author"`
	BodyHTML  string `json:"body_html"`
	BodyText  string `json:"body_text"`
	CreatedAt int64  `json:"created_at"`
}

// listMessages returns the newest page first, like posts; the client reverses
// it for display. ?before= pages backwards through history.
func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	before, limit := pageParams(r, 50, 200)
	rows, err := s.q().ListMessages(r.Context(), store.ListMessagesParams{Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	msgs := make([]Message, 0, len(rows))
	for _, row := range rows {
		msgs = append(msgs, Message{
			ID:        row.ID,
			Author:    User{ID: row.AuthorID, Username: row.AuthorUsername, Role: row.AuthorRole, Picture: pictureURL(row.AuthorPictureID)},
			BodyHTML:  row.BodyHtml,
			BodyText:  row.BodyText,
			CreatedAt: row.CreatedAt,
		})
	}
	var next *int64
	if len(msgs) > limit {
		msgs = msgs[:limit]
		n := msgs[len(msgs)-1].CreatedAt
		next = &n
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs, "next_before": next})
}

func (s *Server) createMessage(w http.ResponseWriter, r *http.Request) {
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
	m := Message{ID: id.String(), Author: author, BodyHTML: clean, BodyText: sanitize.Text(clean), CreatedAt: db.Now()}
	s.logged(w, r, "message", m.CreatedAt, func(qtx *store.Queries) (any, int, error) {
		err := qtx.CreateMessage(r.Context(), store.CreateMessageParams{ID: m.ID, AuthorID: author.ID, BodyHtml: m.BodyHTML, BodyText: m.BodyText, CreatedAt: m.CreatedAt})
		return &m, http.StatusCreated, err
	})
}
