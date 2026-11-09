package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"sweet/internal/db"
	"sweet/internal/store"
)

// MySettings holds a user's own settings. Digest is "weekly" or "off".
type MySettings struct {
	Digest string `json:"digest"`
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
	st := MySettings{Digest: DigestWeekly}
	v, err := q.GetUserSetting(r.Context(), store.GetUserSettingParams{UserID: userID, Key: "digest"})
	switch {
	case err == nil:
		st.Digest = v
	case !errors.Is(err, sql.ErrNoRows):
		return st, err
	}
	_, err = q.GetUserSetting(r.Context(), store.GetUserSettingParams{UserID: userID, Key: welcomedKey})
	switch {
	case err == nil:
		st.Welcomed = true
	case !errors.Is(err, sql.ErrNoRows):
		return st, err
	}
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

// setMySettings is `PUT /api/me/settings {digest, welcomed}`. The settings are the
// user's own, so no event is logged.
func (s *Server) setMySettings(w http.ResponseWriter, r *http.Request) {
	var in MySettings
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	if in.Digest != DigestWeekly && in.Digest != DigestOff {
		writeErr(w, http.StatusBadRequest, "Digest must be weekly or off")
		return
	}
	me, _ := userFrom(r.Context())
	if err := s.q().SetUserSetting(r.Context(), store.SetUserSettingParams{UserID: me.ID, Key: "digest", Value: in.Digest}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if in.Welcomed {
		if err := s.q().SetUserSetting(r.Context(), store.SetUserSettingParams{UserID: me.ID, Key: welcomedKey, Value: strconv.FormatInt(db.Now(), 10)}); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	st, err := mySettingsOf(r, s.q(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}
