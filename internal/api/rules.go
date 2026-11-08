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

// Rules are the community's rules (architecture.md, Admin tools). They are a body in the same format as a post,
// stored in the settings table. An empty body means the community has none.
type Rules struct {
	BodyHTML string `json:"body_html"`
}

const (
	rulesHTMLKey = "rules_html"
	rulesTextKey = "rules_text"
)

func rulesOf(ctx context.Context, q *store.Queries) (Rules, error) {
	v, err := q.GetSetting(ctx, rulesHTMLKey)
	if errors.Is(err, sql.ErrNoRows) {
		return Rules{}, nil
	}
	return Rules{BodyHTML: v}, err
}

// getRules is `GET /api/rules`, for signed-in users. The rules are not public. A person holding an invite reads them
// on the join page through the invite lookup.
func (s *Server) getRules(w http.ResponseWriter, r *http.Request) {
	rules, err := rulesOf(r.Context(), s.q())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

// setRules is `PUT /api/rules {body_html}`, for the owner and moderators. The body is sanitised like a post's. An
// empty body clears the rules. Every signed-in user receives a rules event.
func (s *Server) setRules(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BodyHTML string `json:"body_html"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	clean := sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		clean = ""
	}
	s.logged(w, r, "rules", db.Now(), func(qtx *store.Queries) (any, int, error) {
		for key, value := range map[string]string{rulesHTMLKey: clean, rulesTextKey: sanitize.Text(clean)} {
			if err := qtx.SetSetting(r.Context(), store.SetSettingParams{Key: key, Value: value}); err != nil {
				return nil, http.StatusInternalServerError, err
			}
		}
		rules, err := rulesOf(r.Context(), qtx)
		return &rules, http.StatusOK, err
	})
}
