package api

import (
	"context"
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
	// ReplyTo is the message this one replies to, or nil.
	ReplyTo *ReplyTo `json:"reply_to"`
	// Kind is "message", or "joined" or "added" for a line in the chat. A line has no body. Its author joined, or
	// added Subject.
	Kind    string `json:"kind"`
	Subject *User  `json:"subject"`
	Can     Can    `json:"can"`
}

// ReplyTo is a snippet of the message a reply answers, built from the
// original row when the reply is read. Once the original is deleted, only its
// id and Deleted are sent, so the deleted text is not shown.
type ReplyTo struct {
	ID      string `json:"id"`
	Author  *User  `json:"author"`
	Text    string `json:"text"`
	Deleted bool   `json:"deleted"`
}

// listMessages returns the newest page first, like posts, and the client
// reverses it for display. ?before= pages backwards through history.
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
		writeErr(w, http.StatusForbidden, "Not allowed")
		return
	}
	if g.Mode == perm.ModePosts {
		writeErr(w, http.StatusForbidden, "This room has no chat")
		return
	}
	clean, replyTo, ok := readMessageBody(w, r)
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
	// One transaction writes the message, a notification to each user it
	// mentions, a reply notification to the author of the message it replies
	// to, and in a conversation a notification to the other member.
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		// A reply must point at a live message in this chat.
		answered := "" // the author of the message replied to
		reply := sql.NullString{}
		if replyTo != nil {
			owners, err := qtx.GetMessageOwners(r.Context(), *replyTo)
			if errors.Is(err, sql.ErrNoRows) || (err == nil && (owners.GroupID != g.ID || owners.Kind != MessageKind)) {
				return nil, nil, http.StatusBadRequest, errors.New("You can only reply to a message in this chat")
			}
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			answered = owners.AuthorID
			reply = sql.NullString{String: *replyTo, Valid: true}
		}
		if err := qtx.CreateMessage(r.Context(), store.CreateMessageParams{ID: id.String(), GroupID: g.ID, AuthorID: author.ID, BodyHtml: clean, BodyText: sanitize.Text(clean), CreatedAt: now, ReplyTo: reply}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if status, err := recordUses(r.Context(), qtx, "message", id.String(), author.ID, clean); err != nil {
			return nil, nil, status, err
		}
		row, err := qtx.GetMessage(r.Context(), id.String())
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m := wireMessage(row)
		// In a room's chat the author of the original gets a reply notification and
		// no mention notification as well. In a conversation the message
		// notification covers a reply.
		replied, err := notifyReply(r, qtx, g, answered, author.ID, m.ID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		skip := ""
		if len(replied) > 0 {
			skip = answered
		}
		told, err := mentionEvents(r, qtx, clean, author.ID, g.ID, nil, &m.ID, now, skip)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		told = append(replied, told...)
		messaged, err := notifyMessage(r, qtx, g, author.ID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return append(append([]events.Entry{{Kind: "message", Payload: &m}}, told...), messaged...), &m, http.StatusCreated, nil
	})
}

// deleteMessage deletes a message and empties its text. perm.DeleteMessage decides who may.
// The replies to it are logged again, so the log no longer holds its text in
// their quotes.
func (s *Server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		owners, err := qtx.GetMessageOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("No such message")
		}
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, nil, http.StatusNotFound, errors.New("No such message")
		}
		if owners.Kind != MessageKind || !perm.DeleteMessage(a, perm.Message{AuthorID: owners.AuthorID}) {
			return nil, nil, http.StatusForbidden, errors.New("Not your message")
		}
		gone, err := removeMessage(r.Context(), qtx, id, owners.GroupID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return gone, gone[0].Payload, http.StatusOK, nil
	})
}

// removeMessage deletes a live message and empties its text. It returns the message_delete event, then the events of
// the replies to it. The delete handler, a report's Delete action and the removal of a user all use it.
func removeMessage(ctx context.Context, qtx *store.Queries, id, groupID string, now int64) ([]events.Entry, error) {
	if err := qtx.DeleteMessage(ctx, store.DeleteMessageParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id}); err != nil {
		return nil, err
	}
	replies, err := replyEvents(ctx, qtx, id)
	if err != nil {
		return nil, err
	}
	return append([]events.Entry{{Kind: "message_delete", Payload: map[string]string{"id": id, "group_id": groupID}}}, replies...), nil
}

// replyEvents logs the live replies to a deleted message again, so their quotes say the original is deleted and the
// log no longer holds its text.
func replyEvents(ctx context.Context, qtx *store.Queries, messageID string) ([]events.Entry, error) {
	replies, err := qtx.ListReplyIDs(ctx, sql.NullString{String: messageID, Valid: true})
	if err != nil {
		return nil, err
	}
	var out []events.Entry
	for _, rid := range replies {
		row, err := qtx.GetMessage(ctx, rid)
		if err != nil {
			return nil, err
		}
		m := wireMessage(row)
		out = append(out, events.Entry{Kind: "message", Payload: &m})
	}
	return out, nil
}

// The kinds of message. A joined or added line is a message with no body, so it is in
// order with the messages around it.
const (
	MessageKind = "message"
	JoinedKind  = "joined"
	AddedKind   = "added"
)

// chatLine writes a joined or added line in a group's chat and returns its event. subject is the person added, or ""
// for a joined line.
func chatLine(ctx context.Context, qtx *store.Queries, groupID, kind, author, subject string, now int64) (events.Entry, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return events.Entry{}, err
	}
	if err := qtx.CreateChatLine(ctx, store.CreateChatLineParams{
		ID: id.String(), GroupID: groupID, AuthorID: author, CreatedAt: now, Kind: kind,
		SubjectID: sql.NullString{String: subject, Valid: subject != ""},
	}); err != nil {
		return events.Entry{}, err
	}
	row, err := qtx.GetMessage(ctx, id.String())
	if err != nil {
		return events.Entry{}, err
	}
	m := wireMessage(row)
	return events.Entry{Kind: "message", Payload: &m}, nil
}
