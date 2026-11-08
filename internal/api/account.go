package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/mail"
	"sweet/internal/store"
)

// This file implements accounts (architecture.md, Accounts). An email address
// must be verified before the account can be used. A password is reset by a
// link. A change of address takes effect once the new address is verified. A
// change of password requires the current password. Tokens are stored by
// hash, expire, and can be used once. No endpoint here reveals whether an
// address is registered. A request to send a link gets the same response
// either way.

const (
	TokenVerify = "verify"
	TokenReset  = "reset"
	verifyTTL   = 24 * time.Hour
	resetTTL    = time.Hour
	// tokensPerHour is the maximum number of links of one kind sent to a user per hour.
	tokensPerHour = 5
)

// Account is the signed-in user's view of their own account.
type Account struct {
	Email         *string `json:"email"`
	EmailVerified bool    `json:"email_verified"`
	PendingEmail  *string `json:"pending_email"`
}

// sendToken creates a token of the given kind for a user and an address,
// stores its hash, and emails the link. It is rate limited per user and kind.
func (s *Server) sendToken(ctx context.Context, q *store.Queries, userID, kind, email string) error {
	now := db.Now()
	n, err := q.CountRecentEmailTokens(ctx, store.CountRecentEmailTokensParams{UserID: userID, Kind: kind, Since: now - time.Hour.Milliseconds()})
	if err != nil {
		return err
	}
	if n >= tokensPerHour {
		return nil // Return without error. The client is not told that the limit was reached.
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
	// Every email names the community it comes from, or Sweet when the community has no name yet.
	community := "Sweet"
	if st, err := settingsOf(ctx, q); err == nil && st.Name != "" {
		community = st.Name
	}
	var m mail.Message
	switch kind {
	case TokenVerify:
		m = mail.Content{
			Community: community,
			Heading:   "Verify your email address",
			Lines:     []string{"Open the link to verify your address and sign in to " + community + "."},
			Action:    &mail.Action{Label: "Verify and sign in", URL: s.BaseURL + "/verify/" + token},
			Note:      "The link expires in a day. If you did not ask for it, ignore this email.",
		}.Message(email, "Verify your email for "+community)
	case TokenReset:
		m = mail.Content{
			Community: community,
			Heading:   "Choose a new password",
			Lines:     []string{"Open the link to choose a new password for " + community + "."},
			Action:    &mail.Action{Label: "Choose a new password", URL: s.BaseURL + "/reset/" + token},
			Note:      "The link expires in an hour. If you did not ask for it, ignore this email and your password will not be changed.",
		}.Message(email, "Reset your password for "+community)
	}
	if s.Mail == nil {
		return errors.New("Email is not set up")
	}
	return s.Mail.Send(ctx, m)
}

// useToken finds an unexpired, unused token of the given kind by the token
// string the client holds, and marks it used, inside the caller's
// transaction. A token that is not found, expired or already used returns
// errNotFound in every case.
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

// verify is `POST /api/verify {token}`. The address the token was sent to
// becomes the account's verified address, whether it is the first address or
// a change, and the user is signed in.
func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Token == "" {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
		writeErr(w, http.StatusNotFound, "This link has been used or has expired")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := qtx.SetUserEmailVerified(ctx, store.SetUserEmailVerifiedParams{Email: sql.NullString{String: tok.Email, Valid: true}, VerifiedAt: sql.NullInt64{Int64: db.Now(), Valid: true}, ID: tok.UserID}); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, "That address now belongs to another account")
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

// resendVerification is `POST /api/verify/resend {email}`. It sends a new
// link when the address belongs to an unverified account. The response is 202
// whether or not it does.
func (s *Server) resendVerification(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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

// changeUnverifiedEmail is `POST /api/verify/change {username, password, email}`.
// It lets a user whose account has never been verified change the address the
// verification link is sent to. The password is used in place of a session.
// The old address was never confirmed as the user's, so the new one replaces
// it directly.
func (s *Server) changeUnverifiedEmail(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		credentials
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
			writeErr(w, http.StatusForbidden, "Wrong username or password")
			return
		}
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, err := s.q().SetUnverifiedEmail(r.Context(), store.SetUnverifiedEmailParams{Email: sql.NullString{String: email, Valid: true}, ID: row.ID})
	if db.IsUniqueViolation(err) {
		// The address already has an account. Respond 202 as if the link had been sent, so the
		// response does not reveal which addresses are registered.
		if err := s.tellAddressTaken(r.Context(), email); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n == 0 {
		writeErr(w, http.StatusForbidden, "Wrong username or password")
		return
	}
	if err := s.sendToken(r.Context(), s.q(), row.ID, TokenVerify, email); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

// tellAddressTaken emails an address that someone tried to register or claim
// while it already belongs to an account. The requester gets the same response
// as for an unregistered address, so the API never reveals whether an address
// is registered. The account's owner is notified of the attempt.
func (s *Server) tellAddressTaken(ctx context.Context, email string) error {
	if s.Mail == nil {
		return nil
	}
	owner, err := s.q().GetUserByEmail(ctx, email)
	if err != nil {
		return err
	}
	email = owner.Email.String
	st, err := s.settings(ctx)
	if err != nil {
		return err
	}
	community := st.Name
	if community == "" {
		community = "Sweet"
	}
	m := mail.Content{
		Community: community,
		Heading:   "This address already has an account",
		Lines: []string{
			"Someone tried to use this email address for an account on " + community + ". The address already belongs to your account, so nothing has changed.",
			"If that was you, sign in with your existing account. If you have forgotten your password, you can reset it from the sign-in page.",
		},
		Action: &mail.Action{Label: "Sign in to " + community, URL: s.BaseURL + "/"},
		Note:   "If this was not you, you can ignore this email.",
	}.Message(email, "Someone tried to use your address on "+community)
	return s.Mail.Send(ctx, m)
}

// requestReset is `POST /api/reset {email}`. It sends a link to choose a new
// password when the address belongs to a verified account. The response is
// 202 whether or not it does.
func (s *Server) requestReset(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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

// resetPassword is `POST /api/reset/{token} {password}`. It sets the new
// password, deletes every other session, and signs in the current client.
func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
		writeErr(w, http.StatusNotFound, "This link has been used or has expired")
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

// getAccount is `GET /api/me/account`. It returns the user's address, whether it is verified, and any pending address.
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

// changeEmail is `PUT /api/me/email {email, password}`. The new address is
// stored as pending and sent a verification link. The old address remains
// until the new one is verified. The password is required so that a stolen
// session cannot take over the account.
func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
		writeErr(w, http.StatusForbidden, "Wrong password")
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

// changePassword is `PUT /api/me/password {current, password}`. It requires
// the current password, sets the new one, and deletes every other session.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current  string `json:"current"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
		writeErr(w, http.StatusForbidden, "Wrong password")
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
