package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"unicode"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"

	"github.com/rivo/uniseg"
)

// MaxReactionEmoji is the most different emoji that one post, comment or message holds.
const MaxReactionEmoji = 20

// Reaction is one emoji on a post, comment or message, with the ids of the users who chose it, in the order they did.
type Reaction struct {
	Emoji   string   `json:"emoji"`
	UserIDs []string `json:"user_ids"`
}

// Reactions is an item's reactions after a change, as the reactions event and the response carry them. Kind is "post",
// "comment" or "message". PostID is set for a comment.
type Reactions struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	GroupID   string     `json:"group_id"`
	PostID    string     `json:"post_id,omitempty"`
	Reactions []Reaction `json:"reactions"`
}

// reactionsOf groups an item's reactions column, [emoji, user id] pairs oldest first, by emoji. The emoji are in the
// order of their first reaction. SQLite builds the column, so it always parses.
func reactionsOf(pairs string) []Reaction {
	var raw [][2]string
	_ = json.Unmarshal([]byte(pairs), &raw)
	out := []Reaction{}
	at := map[string]int{}
	for _, p := range raw {
		i, ok := at[p[0]]
		if !ok {
			i = len(out)
			at[p[0]] = i
			out = append(out, Reaction{Emoji: p[0]})
		}
		out[i].UserIDs = append(out[i].UserIDs, p[1])
	}
	return out
}

// isEmoji reports whether s is one emoji: one grapheme of at most 64 bytes. It holds a symbol, as most emoji do, or
// the emoji presentation selector U+FE0F, as ‼️ and ℹ️ do. Its only combining marks are U+FE0F and the keycap U+20E3,
// so a stack of marks is refused. The text presentation selector U+FE0E is refused too, because it would give a
// second reaction that looks the same as the first. Text such as "a", and several emoji such as "👍👍", are refused.
func isEmoji(s string) bool {
	if s == "" || len(s) > 64 || uniseg.GraphemeClusterCount(s) != 1 {
		return false
	}
	pictured := false
	for _, r := range s {
		switch {
		case r == 0xfe0f || unicode.Is(unicode.So, r):
			pictured = true
		case r == 0x20e3:
		case unicode.In(r, unicode.Mn, unicode.Me):
			return false
		}
	}
	return pictured
}

// react is `PUT /api/{posts,comments,messages}/{id}/reactions {emoji, reacted}`. It adds or removes the viewer's emoji
// on an item, and sends the item's reactions to the members of its group.
func (s *Server) react(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Emoji   string `json:"emoji"`
			Reacted bool   `json:"reacted"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeErr(w, http.StatusBadRequest, "Bad request")
			return
		}
		if !isEmoji(in.Emoji) {
			writeErr(w, http.StatusBadRequest, "A reaction is one emoji")
			return
		}
		id := r.PathValue("id")
		me, _ := userFrom(r.Context())
		s.logged(w, r, "reactions", db.Now(), func(qtx *store.Queries) (any, int, error) {
			ctx := r.Context()
			out := Reactions{ID: id, Kind: kind}
			var a perm.Actor
			switch kind {
			case "post":
				owners, actor, status, err := s.postActor(r, qtx, id)
				if err != nil {
					return nil, status, err
				}
				out.GroupID, a = owners.GroupID, actor
			case "comment":
				owners, actor, status, err := s.commentActor(r, qtx, id)
				if err != nil {
					return nil, status, err
				}
				out.GroupID, out.PostID, a = owners.GroupID, owners.PostID, actor
			case "message":
				owners, actor, status, err := s.messageActor(r, qtx, id)
				if err != nil {
					return nil, status, err
				}
				a = actor
				if owners.Kind != MessageKind {
					return nil, http.StatusBadRequest, errors.New("A line in the chat takes no reactions")
				}
				out.GroupID = owners.GroupID
			}
			if !perm.React(a) {
				return nil, http.StatusForbidden, errors.New("Not allowed")
			}
			if in.Reacted {
				others, err := qtx.CountOtherReactionEmoji(ctx, store.CountOtherReactionEmojiParams{ItemID: id, Emoji: in.Emoji})
				if err != nil {
					return nil, http.StatusInternalServerError, err
				}
				if others >= MaxReactionEmoji {
					return nil, http.StatusConflict, fmt.Errorf("A post, comment or message can have at most %d different reactions", MaxReactionEmoji)
				}
				if err := qtx.AddReaction(ctx, store.AddReactionParams{ItemID: id, Emoji: in.Emoji, UserID: me.ID, CreatedAt: db.Now()}); err != nil {
					return nil, http.StatusInternalServerError, err
				}
			} else if err := qtx.RemoveReaction(ctx, store.RemoveReactionParams{ItemID: id, Emoji: in.Emoji, UserID: me.ID}); err != nil {
				return nil, http.StatusInternalServerError, err
			}
			pairs, err := qtx.GetReactions(ctx, id)
			if err != nil {
				return nil, http.StatusInternalServerError, err
			}
			out.Reactions = reactionsOf(pairs)
			return &out, http.StatusOK, nil
		})
	}
}

// frequentReactions is `GET /api/me/reactions`. It lists the emoji the viewer reacts with most, at most six, the most
// used first. The reaction picker offers them first.
func (s *Server) frequentReactions(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	emoji, err := s.q().ListFrequentReactions(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if emoji == nil {
		emoji = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"emoji": emoji})
}

// forgetReactions deletes the reactions of an item that is being deleted, and of the comments under it when it is a
// post, with their events in the event log. removePost, removeComment and removeMessage call it.
func forgetReactions(ctx context.Context, qtx *store.Queries, id string) error {
	if err := qtx.ForgetReactionEvents(ctx, id); err != nil {
		return err
	}
	return qtx.DeleteReactions(ctx, id)
}
