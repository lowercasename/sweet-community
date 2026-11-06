package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/mail"
	"sweet/internal/store"
)

// Accounts (architecture.md, Accounts): an address, verified before the
// account may be used; a password reset by a link; a change of address
// that takes effect once the new one is verified; a change of password
// with the old one in hand. Tokens are stored by hash, expire, and are
// used once. Nothing here says whether an address is known: the answer to
// "send me a link" is the same either way.

const (
	TokenVerify = "verify"
	TokenReset  = "reset"
	verifyTTL   = 24 * time.Hour
	resetTTL    = time.Hour
	// A person gets at most this many of a kind of link an hour.
	tokensPerHour = 5
)

// Account is what the signed-in person sees of their own account.
type Account struct {
	Email         *string `json:"email"`
	EmailVerified bool    `json:"email_verified"`
	PendingEmail  *string `json:"pending_email"`
}

// sendToken makes a token of a kind for a person and an address, stores its
// hash, and mails the link. Rate limited per person and kind.
func (s *Server) sendToken(ctx context.Context, q *store.Queries, userID, kind, email string) error {
	now := db.Now()
	n, err := q.CountRecentEmailTokens(ctx, store.CountRecentEmailTokensParams{UserID: userID, Kind: kind, Since: now - time.Hour.Milliseconds()})
	if err != nil {
		return err
	}
	if n >= tokensPerHour {
		return nil // quietly: the limit is not the asker's business
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	ttl := verifyTTL
	if kind == TokenReset {
		ttl = resetTTL
	}
	if err := q.CreateEmailToken(ctx, store.CreateEmailTokenParams{Hash: hash, UserID: userID, Kind: kind, Email: email, CreatedAt: now, ExpiresAt: now + ttl.Milliseconds()}); err != nil {
		return err
	}
	var m mail.Message
	switch kind {
	case TokenVerify:
		m = mail.Message{To: email, Subject: "Verify your email for Sweet", Text: fmt.Sprintf("Open this link to verify your email address:\n\n%s/verify/%s\n\nIt works once, for a day. If you did not ask for it, ignore this.", s.BaseURL, token)}
	case TokenReset:
		m = mail.Message{To: email, Subject: "Reset your Sweet password", Text: fmt.Sprintf("Open this link to choose a new password:\n\n%s/reset/%s\n\nIt works once, for an hour. If you did not ask for it, ignore this and your password stays as it is.", s.BaseURL, token)}
	}
	if s.Mail == nil {
		return errors.New("no way to send email is configured")
	}
	return s.Mail.Send(ctx, m)
}

// useToken finds a live token of a kind by the token the client holds and
// spends it, inside the caller's transaction. Not found, expired and spent
// are the same answer: not valid.
func useToken(ctx context.Context, q *store.Queries, token, kind string) (store.GetEmailTokenRow, error) {
	row, err := q.GetEmailToken(ctx, auth.HashToken(token))
	if errors.Is(err, sql.ErrNoRows) || (err == nil && row.Kind != kind) {
		return row, errNotFound
	}
	if err != nil {
		return row, err
	}
	n, err := q.UseEmailToken(ctx, store.UseEmailTokenParams{UsedAt: sql.NullInt64{Int64: db.Now(), Valid: true}, Hash: row.Hash, Now: db.Now()})
	if err != nil {
		return row, err
	}
	if n == 0 {
		return row, errNotFound
	}
	return row, nil
}

// verify is `POST /api/verify {token}`: the address the token was sent to
// becomes the account's verified one (a first address, or a change), and
// the person is signed in.
func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Token == "" {
		writeErr(w, http.StatusBadRequest, "bad request body")
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
	tok, err := useToken(ctx, qtx, in.Token, TokenVerify)
	if errors.Is(err, errNotFound) {
		writeErr(w, http.StatusNotFound, "that link has been used, or has expired, or never was")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserEmailVerified(ctx, store.SetUserEmailVerifiedParams{Email: sql.NullString{String: tok.Email, Valid: true}, VerifiedAt: sql.NullInt64{Int64: db.Now(), Valid: true}, ID: tok.UserID}); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, "that address now belongs to another account")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	u, err := qtx.GetUser(ctx, tok.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	token, err := s.issueSession(w, r, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": wireUser(u.ID, u.Username, u.PictureID), "token": token})
}

// resendVerification is `POST /api/verify/resend {email}`: a new link to an
// address that belongs to an unverified account; the same 202 either way.
func (s *Server) resendVerification(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(r.RemoteAddr) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts; wait a moment")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	row, err := s.q().GetUserByEmail(r.Context(), strings.TrimSpace(in.Email))
	if err == nil && !row.EmailVerifiedAt.Valid && !row.RemovedAt.Valid {
		if err := s.sendToken(r.Context(), s.q(), row.ID, TokenVerify, row.Email.String); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// changeUnverifiedEmail is `POST /api/verify/change {username, password, email}`:
// the "didn't get it? change the address" of a person whose account has
// never been verified. Their password stands in for a session. The old
// address was never theirs for certain, so the new one simply replaces it.
func (s *Server) changeUnverifiedEmail(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(r.RemoteAddr) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts; wait a moment")
		return
	}
	var in struct {
		credentials
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	email := strings.TrimSpace(in.Email)
	if err := auth.ValidateEmail(email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	row, err := s.q().GetUserByUsername(r.Context(), in.Username)
	if errors.Is(err, sql.ErrNoRows) || !row.PasswordHash.Valid || !auth.CheckPassword(row.PasswordHash.String, in.Password) || row.EmailVerifiedAt.Valid || row.RemovedAt.Valid {
		if err == nil || errors.Is(err, sql.ErrNoRows) {
			writeErr(w, http.StatusForbidden, "wrong username or password")
			return
		}
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, err := s.q().SetUnverifiedEmail(r.Context(), store.SetUnverifiedEmailParams{Email: sql.NullString{String: email, Valid: true}, ID: row.ID})
	if db.IsUniqueViolation(err) {
		writeErr(w, http.StatusConflict, "that email address already has an account")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n == 0 {
		writeErr(w, http.StatusForbidden, "wrong username or password")
		return
	}
	if err := s.sendToken(r.Context(), s.q(), row.ID, TokenVerify, email); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// requestReset is `POST /api/reset {email}`: a link to choose a new password,
// if the address belongs to a verified account; the same 202 either way.
func (s *Server) requestReset(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(r.RemoteAddr) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts; wait a moment")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	row, err := s.q().GetUserByEmail(r.Context(), strings.TrimSpace(in.Email))
	if err == nil && row.EmailVerifiedAt.Valid && !row.RemovedAt.Valid {
		if err := s.sendToken(r.Context(), s.q(), row.ID, TokenReset, row.Email.String); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// resetPassword is `POST /api/reset/{token} {password}`: the new password,
// every other session ended, and this one signed in.
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
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
	tok, err := useToken(ctx, qtx, r.PathValue("token"), TokenReset)
	if errors.Is(err, errNotFound) {
		writeErr(w, http.StatusNotFound, "that link has been used, or has expired, or never was")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserPassword(ctx, store.SetUserPasswordParams{PasswordHash: sql.NullString{String: hash, Valid: true}, ID: tok.UserID}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.DeleteUserSessions(ctx, tok.UserID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	u, err := qtx.GetUser(ctx, tok.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	token, err := s.issueSession(w, r, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": wireUser(u.ID, u.Username, u.PictureID), "token": token})
}

// getAccount is `GET /api/me/account`: my address and whether it is verified, and one waiting to be.
func (s *Server) getAccount(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	row, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, accountOf(row))
}

func accountOf(row store.GetAccountRow) Account {
	a := Account{EmailVerified: row.EmailVerifiedAt.Valid}
	if row.Email.Valid {
		e := row.Email.String
		a.Email = &e
	}
	if row.PendingEmail.Valid {
		p := row.PendingEmail.String
		a.PendingEmail = &p
	}
	return a
}

// changeEmail is `PUT /api/me/email {email, password}`: the new address
// waits as pending and gets a verification link; the old one stays until
// the new is verified. The password, so a stolen session cannot take the account.
func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	email := strings.TrimSpace(in.Email)
	if err := auth.ValidateEmail(email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	me, _ := userFrom(r.Context())
	row, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !row.PasswordHash.Valid || !auth.CheckPassword(row.PasswordHash.String, in.Password) {
		writeErr(w, http.StatusForbidden, "wrong password")
		return
	}
	if err := s.q().SetUserPendingEmail(r.Context(), store.SetUserPendingEmailParams{PendingEmail: sql.NullString{String: email, Valid: true}, ID: me.ID}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.sendToken(r.Context(), s.q(), me.ID, TokenVerify, email); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	row, err = s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, accountOf(row))
}

// changePassword is `PUT /api/me/password {current, password}`: the new one
// with the old one in hand; every other session ends.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if err := auth.ValidatePassword(in.Password); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	me, _ := userFrom(r.Context())
	row, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !row.PasswordHash.Valid || !auth.CheckPassword(row.PasswordHash.String, in.Current) {
		writeErr(w, http.StatusForbidden, "wrong password")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.q().SetUserPassword(r.Context(), store.SetUserPasswordParams{PasswordHash: sql.NullString{String: hash, Valid: true}, ID: me.ID}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.q().DeleteOtherSessions(r.Context(), store.DeleteOtherSessionsParams{UserID: me.ID, ID: sessionFrom(r.Context())}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
