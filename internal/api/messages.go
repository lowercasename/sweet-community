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

// Message is one chat message in a group's room.
type Message struct {
	ID        string `json:"id"`
	GroupID   string `json:"group_id"`
	Author    User   `json:"author"`
	BodyHTML  string `json:"body_html"`
	BodyText  string `json:"body_text"`
	CreatedAt int64  `json:"created_at"`
	Can       Can    `json:"can"`
}

// listMessages returns the newest page first, like posts; the client reverses
// it for display. ?before= pages backwards through history.
func (s *Server) listMessages(w http.ResponseWriter, r *http.Request) {
	g, a := groupFrom(r.Context())
	before, limit := pageParams(r, 50, 200)
	rows, err := s.q().ListMessages(r.Context(), store.ListMessagesParams{GroupID: g.ID, Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	msgs := make([]Message, 0, len(rows))
	for _, row := range rows {
		m := wireMessage(store.GetMessageRow(row))
		msgs = append(msgs, *forViewer(a, &m, Settings{}).(*Message))
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
	g, a := groupFrom(r.Context())
	if !perm.Write(a) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	if g.Mode == perm.ModePosts {
		writeErr(w, http.StatusForbidden, "this group has no chat")
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
	now := db.Now()
	// The message, and a notification to each person it mentions, in one transaction.
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if err := qtx.CreateMessage(r.Context(), store.CreateMessageParams{ID: id.String(), GroupID: g.ID, AuthorID: author.ID, BodyHtml: clean, BodyText: sanitize.Text(clean), CreatedAt: now}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetMessage(r.Context(), id.String())
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m := wireMessage(row)
		told, err := mentionEvents(r, qtx, clean, author.ID, g.ID, nil, now, "")
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return append([]events.Entry{{Kind: "message", Payload: &m}}, told...), &m, http.StatusCreated, nil
	})
}

// deleteMessage soft-deletes a message (perm.DeleteMessage says who may).
func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "message_delete", now, func(qtx *store.Queries) (any, int, error) {
		owners, err := qtx.GetMessageOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such message")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, http.StatusNotFound, errors.New("no such message")
		}
		if !perm.DeleteMessage(a, perm.Message{AuthorID: owners.AuthorID}) {
			return nil, http.StatusForbidden, errors.New("not your message")
		}
		if err := qtx.DeleteMessage(r.Context(), store.DeleteMessageParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return map[string]string{"id": id, "group_id": owners.GroupID}, http.StatusOK, nil
	})
}
