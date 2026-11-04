package api

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/sanitize"
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
	limit := 50
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 200 {
		limit = v
	}
	before := int64(1 << 62)
	if v, err := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64); err == nil && v > 0 {
		before = v
	}
	rows, err := s.DB.QueryContext(r.Context(), `
		SELECT m.id, m.body_html, m.body_text, m.created_at, u.id, u.username, u.role
		FROM messages m JOIN users u ON u.id = m.author_id
		WHERE m.deleted_at IS NULL AND m.created_at < ?
		ORDER BY m.created_at DESC, m.id DESC
		LIMIT ?`, before, limit+1)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	msgs := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.BodyHTML, &m.BodyText, &m.CreatedAt, &m.Author.ID, &m.Author.Username, &m.Author.Role); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		msgs = append(msgs, m)
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

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO messages (id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?)`,
		m.ID, m.Author.ID, m.BodyHTML, m.BodyText, m.CreatedAt); err != nil {
		tx.Rollback()
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ev, err := events.Log(ctx, tx, "message", &m, m.CreatedAt)
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
	writeJSON(w, http.StatusCreated, m)
}
