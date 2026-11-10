package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/db"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// CommunityText is a body that the owner and moderators write for every member to read. There are two, the rules and
// the welcome message. Each is a body in the same format as a post, stored in
// the settings table. An empty body means the community has none.
type CommunityText struct {
	BodyHTML string `json:"body_html"`
}

// communityText names one community text: its two settings keys and the kind of the event that carries it.
type communityText struct {
	htmlKey, textKey, event string
}

var (
	rulesText   = communityText{htmlKey: "rules_html", textKey: "rules_text", event: "rules"}
	welcomeText = communityText{htmlKey: "welcome_html", textKey: "welcome_text", event: "welcome"}
)

func (t communityText) of(ctx context.Context, q *store.Queries) (CommunityText, error) {
	v, err := q.GetSetting(ctx, t.htmlKey)
	if errors.Is(err, sql.ErrNoRows) {
		return CommunityText{}, nil
	}
	return CommunityText{BodyHTML: v}, err
}

// getText is `GET /api/rules` or `GET /api/welcome`, for signed-in users. The texts are not public. A person holding
// an invite reads the rules on the join page through the invite lookup.
func (s *Server) getText(t communityText) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		text, err := t.of(r.Context(), s.q())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, text)
	}
}

// setText is `PUT /api/rules {body_html}` or `PUT /api/welcome {body_html}`, for the owner and moderators. The body
// is sanitised like a post, without images or preview cards. An empty body clears the text. Every signed-in user receives the text's event.
func (s *Server) setText(t communityText) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			BodyHTML string `json:"body_html"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeErr(w, http.StatusBadRequest, "Bad request")
			return
		}
		clean := sanitize.WithoutMedia(in.BodyHTML)
		if sanitize.IsEmpty(clean) {
			clean = ""
		}
		s.logged(w, r, t.event, db.Now(), func(qtx *store.Queries) (any, int, error) {
			for key, value := range map[string]string{t.htmlKey: clean, t.textKey: sanitize.Text(clean)} {
				if err := qtx.SetSetting(r.Context(), store.SetSettingParams{Key: key, Value: value}); err != nil {
					return nil, http.StatusInternalServerError, err
				}
			}
			text, err := t.of(r.Context(), qtx)
			return &text, http.StatusOK, err
		})
	}
}
