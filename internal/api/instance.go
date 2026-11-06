package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// A fresh instance (architecture.md, New-instance lifecycle): started with no
// owner, it mints a one-time setup link and prints it; whoever opens it
// becomes the owner, with the address they give taken as verified, since
// holding the link is holding the box. Then onboarding: the community has no
// name until the owner gives it one, and the client keeps them on the welcome
// page until it does.

const setupTokenKey = "setup_token"

// SetupLink is called at start when the root group has no owner with a
// password: it replaces any earlier token (the link in the newest log is the
// one that works) and returns the link to print.
func SetupLink(ctx context.Context, d *sql.DB, baseURL string) (string, error) {
	token, hash, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	if err := store.New(d).SetSetting(ctx, store.SetSettingParams{Key: setupTokenKey, Value: hash}); err != nil {
		return "", err
	}
	return baseURL + "/setup/" + token, nil
}

// NeedsSetup is whether the instance has no owner able to sign in.
func NeedsSetup(ctx context.Context, d *sql.DB) (bool, error) {
	st, err := settingsOf(ctx, store.New(d))
	return !st.OwnerSet, err
}

// setup is `POST /api/setup {token, username, email, password}`: the owner's
// account, from the setup link, signed in. Once: the token goes with it.
func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.open(r.RemoteAddr) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts; wait a moment")
		return
	}
	var in struct {
		Token string `json:"token"`
		Email string `json:"email"`
		credentials
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if err := auth.ValidateUsername(in.Username); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	in.Email = strings.TrimSpace(in.Email)
	if err := auth.ValidateEmail(in.Email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := auth.ValidatePassword(in.Password); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	qtx := store.New(tx)
	want, err := qtx.GetSetting(ctx, setupTokenKey)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && want != auth.HashToken(in.Token)) {
		s.limiter.spend(r.RemoteAddr)
		writeErr(w, http.StatusNotFound, "that setup link does not work; the one in the server's newest log does")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	st, err := settingsOf(ctx, qtx)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if st.OwnerSet {
		writeErr(w, http.StatusConflict, "this community already has its owner")
		return
	}
	now := db.Now()
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// An owner made by the command line without a password is taken over
	// rather than duplicated; otherwise the account is new.
	ownerID, err := qtx.GetGroupOwnerID(ctx, perm.Root)
	if err == nil {
		row, err := qtx.GetUser(ctx, ownerID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if row.Username != in.Username {
			if err := qtx.RenameUser(ctx, store.RenameUserParams{Username: in.Username, ID: ownerID}); err != nil {
				if db.IsUniqueViolation(err) {
					writeErr(w, http.StatusConflict, "that username is taken")
					return
				}
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		id = uuid.MustParse(ownerID)
	} else if errors.Is(err, sql.ErrNoRows) {
		if err := qtx.CreateUser(ctx, store.CreateUserParams{ID: id.String(), Username: in.Username, CreatedAt: now}); err != nil {
			if db.IsUniqueViolation(err) {
				writeErr(w, http.StatusConflict, "that username is taken")
				return
			}
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := qtx.CreateMembership(ctx, store.CreateMembershipParams{GroupID: perm.Root, UserID: id.String(), Role: perm.Owner, JoinedAt: now}); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	} else {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserPassword(ctx, store.SetUserPasswordParams{PasswordHash: sql.NullString{String: hash, Valid: true}, ID: id.String()}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserEmailVerified(ctx, store.SetUserEmailVerifiedParams{Email: sql.NullString{String: in.Email, Valid: true}, VerifiedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id.String()}); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, "that email address already has an account")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.DeleteSetting(ctx, setupTokenKey); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	u, err := qtx.GetUser(ctx, id.String())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	log.Printf("owner %q set up through the setup link", u.Username)
	token, err := s.issueSession(w, r, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": wireUser(u.ID, u.Username, u.PictureID), "token": token})
}
