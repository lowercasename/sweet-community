package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/store"
)

// MySettings is what a person sets for themselves (architecture.md,
// Notifications: per-person, with off one click away). Digest is "weekly"
// or "off".
type MySettings struct {
	Digest string `json:"digest"`
}

const (
	DigestWeekly = "weekly"
	DigestOff    = "off"
)

func mySettingsOf(r *http.Request, q *store.Queries, userID string) (MySettings, error) {
	st := MySettings{Digest: DigestWeekly}
	v, err := q.GetUserSetting(r.Context(), store.GetUserSettingParams{UserID: userID, Key: "digest"})
	if errors.Is(err, sql.ErrNoRows) {
		return st, nil
	}
	if err != nil {
		return st, err
	}
	st.Digest = v
	return st, nil
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

// setMySettings is `PUT /api/me/settings {digest}`. Mine alone: no event.
func (s *Server) setMySettings(w http.ResponseWriter, r *http.Request) {
	var in MySettings
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	if in.Digest != DigestWeekly && in.Digest != DigestOff {
		writeErr(w, http.StatusBadRequest, "The digest is weekly or off")
		return
	}
	me, _ := userFrom(r.Context())
	if err := s.q().SetUserSetting(r.Context(), store.SetUserSettingParams{UserID: me.ID, Key: "digest", Value: in.Digest}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	st, err := mySettingsOf(r, s.q(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}
