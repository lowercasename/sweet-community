package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"sweet/internal/db"
	"sweet/internal/store"
)

// MySettings holds a user's own settings. Digest is "weekly" or "off".
type MySettings struct {
	UserID            string `json:"user_id"`
	Digest            string `json:"digest"`
	PushComments      bool   `json:"push_comments"`
	PushMentions      bool   `json:"push_mentions"`
	PushConversations bool   `json:"push_conversations"`
	// Welcomed is true once the user has closed the welcome dialog. It is state rather than a setting. It only moves
	// from false to true, so a request that leaves it out or sends false does not show the dialog again.
	Welcomed bool `json:"welcomed"`
}

const (
	DigestWeekly = "weekly"
	DigestOff    = "off"
	// welcomedKey is stored once the user has closed the welcome dialog. Its value is the time.
	welcomedKey = "welcomed_at"
)

func mySettingsOf(r *http.Request, q *store.Queries, userID string) (MySettings, error) {
	rows, err := q.ListUserSettings(r.Context(), userID)
	if err != nil {
		return MySettings{}, err
	}
	return wireMySettings(userID, rows), nil
}

// getMySettings is `GET /api/me/settings`.
func (s *Server) getMySettings(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	st, err := mySettingsOf(r, s.q(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// setMySettings changes only supplied fields and synchronises them across the user's devices.
func (s *Server) setMySettings(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Digest            *string `json:"digest"`
		Welcomed          bool    `json:"welcomed"`
		PushComments      *bool   `json:"push_comments"`
		PushMentions      *bool   `json:"push_mentions"`
		PushConversations *bool   `json:"push_conversations"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		writeErr(w, 400, "Bad request")
		return
	}
	if in.Digest != nil && *in.Digest != DigestWeekly && *in.Digest != DigestOff {
		writeErr(w, 400, "Digest must be weekly or off")
		return
	}
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.logged(w, r, "my_settings", now, func(q *store.Queries) (any, int, error) {
		values := map[string]string{}
		if in.Digest != nil {
			values["digest"] = *in.Digest
		}
		if in.Welcomed {
			values[welcomedKey] = strconv.FormatInt(now, 10)
		}
		for key, value := range map[string]*bool{"push_comments": in.PushComments, "push_mentions": in.PushMentions, "push_conversations": in.PushConversations} {
			if value != nil {
				values[key] = strconv.FormatBool(*value)
			}
		}
		for key, value := range values {
			if err := q.SetUserSetting(r.Context(), store.SetUserSettingParams{UserID: me.ID, Key: key, Value: value}); err != nil {
				return nil, 500, err
			}
		}
		st, err := mySettingsOf(r, q, me.ID)
		return st, 200, err
	})
}
