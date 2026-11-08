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

// This file implements a new instance's setup (architecture.md, New-instance
// lifecycle). An instance started with no owner creates a one-time setup
// link and prints it. Whoever opens the link becomes the owner. The address
// they give is treated as verified, because access to the link implies
// access to the server. Then onboarding follows. The community has no name
// until the owner sets one, and the client keeps the owner on the welcome
// page until they do.

const setupTokenKey = "setup_token"

// SetupLink is called at start when the root group has no owner with a
// password. It replaces any earlier token, so only the link in the newest log
// output works, and returns the link to print.
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

// NeedsSetup reports whether the instance has no owner able to sign in.
func NeedsSetup(ctx context.Context, d *sql.DB) (bool, error) {
	st, err := settingsOf(ctx, store.New(d))
	return !st.OwnerSet, err
}

// setup is `POST /api/setup {token, username, email, password}`, with the password optional. It creates
// the owner's account from the setup link and signs them in. It works once,
// because the token is deleted with it.
func (s *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.open(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		Token string `json:"token"`
		Email string `json:"email"`
		credentials
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
	// The password is optional (architecture.md, Accounts). Without one, the owner signs in by email.
	var hash sql.NullString
	if in.Password != "" {
		if err := auth.ValidatePassword(in.Password); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		h, err := auth.HashPassword(in.Password)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		hash = sql.NullString{String: h, Valid: true}
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
		s.limiter.spend(s.clientAddr(r))
		writeErr(w, http.StatusNotFound, "This setup link does not work")
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
		writeErr(w, http.StatusConflict, "This community has already been set up")
		return
	}
	now := db.Now()
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// An owner created at the command line without a password is reused
	// rather than duplicated. Otherwise a new account is created.
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
					writeErr(w, http.StatusConflict, "That username is taken")
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
				writeErr(w, http.StatusConflict, "That username is taken")
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
	if err := qtx.SetUserPassword(ctx, store.SetUserPasswordParams{PasswordHash: hash, ID: id.String()}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserEmailVerified(ctx, store.SetUserEmailVerifiedParams{Email: sql.NullString{String: in.Email, Valid: true}, VerifiedAt: sql.NullInt64{Int64: now, Valid: true}, ID: id.String()}); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, "That email address already has an account")
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
