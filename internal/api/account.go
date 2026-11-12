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

// This file implements the account settings and the email tokens.
// A password is optional. Signing in by email is
// in signin.go. A change of address takes effect once the new address is
// confirmed by a link, and that link signs nobody in. Tokens are stored by
// hash, expire, and can be used once. No endpoint reveals whether an address
// is registered.

const (
	TokenSignin = "signin"
	TokenVerify = "verify"
	signinTTL   = 15 * time.Minute
	verifyTTL   = 24 * time.Hour
	// tokensPerHour is the maximum number of emails of one kind sent to a user per hour.
	tokensPerHour = 5
)

// Account is the signed-in user's view of their own account.
type Account struct {
	Email         *string `json:"email"`
	EmailVerified bool    `json:"email_verified"`
	PendingEmail  *string `json:"pending_email"`
	HasPassword   bool    `json:"has_password"`
}

// communityName returns the community's name for an email, or Sweet when it has none.
func communityName(ctx context.Context, q *store.Queries) string {
	if st, err := settingsOf(ctx, q); err == nil && st.Name != "" {
		return st.Name
	}
	return "Sweet"
}

func (s *Server) sendMail(ctx context.Context, m mail.Message) error {
	if s.Mail == nil {
		return errors.New("Email is not set up")
	}
	return s.Mail.Send(ctx, m)
}

// rationed reports whether a user has been sent tokensPerHour emails of one kind in the last hour. A request beyond
// that sends nothing, and the client is not told.
func rationed(ctx context.Context, q *store.Queries, userID, kind string) (bool, error) {
	n, err := q.CountRecentEmailTokens(ctx, store.CountRecentEmailTokensParams{UserID: userID, Kind: kind, Since: db.Now() - time.Hour.Milliseconds()})
	return n >= tokensPerHour, err
}

// sendVerify sends a link that confirms a changed address. It voids the user's older confirmation links first, so only
// the newest change can be confirmed.
func (s *Server) sendVerify(ctx context.Context, q *store.Queries, userID, email string) error {
	now := db.Now()
	if err := q.VoidUserTokensOfKind(ctx, store.VoidUserTokensOfKindParams{Now: sql.NullInt64{Int64: now, Valid: true}, UserID: userID, Kind: TokenVerify}); err != nil {
		return err
	}
	if full, err := rationed(ctx, q, userID, TokenVerify); err != nil || full {
		return err
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := q.CreateEmailToken(ctx, store.CreateEmailTokenParams{Hash: hash, UserID: userID, Kind: TokenVerify, Email: email, CreatedAt: now, ExpiresAt: now + verifyTTL.Milliseconds()}); err != nil {
		return err
	}
	community := communityName(ctx, q)
	return s.sendMail(ctx, mail.Content{
		Community: community,
		Heading:   "Confirm your new email address",
		Lines:     []string{"Open the link to confirm that this is your new address for " + community + "."},
		Action:    &mail.Action{Label: "Confirm address", URL: s.BaseURL + "/verify/" + token},
		Note:      "The link expires in a day. If you did not ask for this change, ignore this email and your address will not change.",
	}.Message(email, "Confirm your new address for "+community))
}

// tellAccountChanged emails a notice of a change to the account to an address, so that a change made from a stolen
// session does not go unnoticed.
func (s *Server) tellAccountChanged(ctx context.Context, q *store.Queries, email, heading, line string) error {
	if email == "" || s.Mail == nil {
		return nil
	}
	community := communityName(ctx, q)
	return s.sendMail(ctx, mail.Content{
		Community: community,
		Heading:   heading,
		Lines:     []string{line, "If you did not make this change, sign in, change it back, and choose Sign out everywhere in Settings."},
		Action:    &mail.Action{Label: "Sign in to " + community, URL: s.BaseURL + "/"},
	}.Message(email, heading))
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

// verify is `POST /api/verify {token}`. It confirms a changed address. The
// pending address that the link was sent to becomes the account's verified
// address. Outstanding sign-in links and codes are voided in the same transaction.
// Existing sessions stay active. The old address is told of the change.
// Before 2026-11-08 the link also signed in whoever opened it.
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
	gone := func() { writeErr(w, http.StatusNotFound, "This link has been used or has expired") }
	tok, err := useToken(ctx, qtx, in.Token, TokenVerify)
	if errors.Is(err, errNotFound) {
		gone()
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	acct, err := qtx.GetAccount(ctx, tok.UserID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The link confirms only the address that is still pending.
	if acct.RemovedAt.Valid || !acct.PendingEmail.Valid || !strings.EqualFold(acct.PendingEmail.String, tok.Email) {
		gone()
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
	if err := qtx.VoidUserTokensOfKind(ctx, store.VoidUserTokensOfKindParams{Now: sql.NullInt64{Int64: db.Now(), Valid: true}, UserID: tok.UserID, Kind: TokenSignin}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if acct.Email.Valid && !strings.EqualFold(acct.Email.String, tok.Email) {
		line := "The email address for your account on " + communityName(ctx, s.q()) + " is now " + tok.Email + "."
		if err := s.tellAccountChanged(ctx, s.q(), acct.Email.String, "Your email address was changed", line); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"email": tok.Email})
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
			"If that was you, sign in to your existing account. The sign-in page can send you a sign-in email.",
		},
		Action: &mail.Action{Label: "Sign in to " + community, URL: s.BaseURL + "/"},
		Note:   "If this was not you, you can ignore this email.",
	}.Message(email, "Someone tried to use your address on "+community)
	return s.Mail.Send(ctx, m)
}

// getAccount is `GET /api/me/account`. It returns the user's address, whether it is verified, any pending address, and
// whether the account has a password.
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
	a := Account{EmailVerified: row.EmailVerifiedAt.Valid, HasPassword: row.PasswordHash.Valid}
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

// changeEmail is `PUT /api/me/email {email}`. The new address is stored as
// pending and sent a confirmation link. The old address remains until the new
// one is confirmed. A newer change voids the older links. No password is
// asked for, because a password is optional.
func (s *Server) changeEmail(w http.ResponseWriter, r *http.Request) {
	var in struct {
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
	me, _ := userFrom(r.Context())
	if err := s.q().SetUserPendingEmail(r.Context(), store.SetUserPendingEmailParams{PendingEmail: sql.NullString{String: email, Valid: true}, ID: me.ID}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.sendVerify(r.Context(), s.q(), me.ID, email); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	row, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, accountOf(row))
}

// setUsername is `PUT /api/me/username {username}`. It renames the signed-in user. Content refers to the user's id, so
// posts, comments, messages and mentions show the new name. A "user" event carries the user, so every open page redraws
// the name. The old name is free for anyone at once.
func (s *Server) setUsername(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Username string `json:"username"`
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
	me, _ := userFrom(r.Context())
	s.logged(w, r, "user", db.Now(), func(qtx *store.Queries) (any, int, error) {
		if err := qtx.RenameUser(r.Context(), store.RenameUserParams{Username: in.Username, ID: me.ID}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, http.StatusConflict, auth.ErrUsernameTaken
			}
			return nil, http.StatusInternalServerError, err
		}
		return currentUser(r.Context(), qtx, me.ID)
	})
}

// currentUser reads a user inside a write, for its "user" event. The event then carries the row as it is now. The
// request's own copy of the user was read before the write began, and another change may have happened since.
func currentUser(ctx context.Context, qtx *store.Queries, id string) (any, int, error) {
	row, err := qtx.GetUser(ctx, id)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	return wireUser(row.ID, row.Username, row.PictureID), http.StatusOK, nil
}

// setPassword is `PUT /api/me/password {password}`. It sets a password, or
// changes the one the account has. It asks for no current password, because
// the account's email can always sign in. It ends every other session and
// emails a notice to the account's address.
func (s *Server) setPassword(w http.ResponseWriter, r *http.Request) {
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
	me, _ := userFrom(r.Context())
	acct, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !s.replacePassword(w, r, me.ID, sql.NullString{String: hash, Valid: true}) {
		return
	}
	community := communityName(r.Context(), s.q())
	heading, line := "Your password was changed", "The password for your account on "+community+" was changed."
	if !acct.PasswordHash.Valid {
		heading, line = "Your password was set", "You can now sign in to "+community+" with a password as well as by email."
	}
	if err := s.tellAccountChanged(r.Context(), s.q(), acct.Email.String, heading, line); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// removePassword is `DELETE /api/me/password`. The account then signs in by
// email only. An account without a verified address cannot remove its
// password, because it would have no way to sign in.
func (s *Server) removePassword(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	acct, err := s.q().GetAccount(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !acct.Email.Valid || !acct.EmailVerifiedAt.Valid {
		writeErr(w, http.StatusBadRequest, "Add an email address before you remove your password")
		return
	}
	if !s.replacePassword(w, r, me.ID, sql.NullString{}) {
		return
	}
	line := "You now sign in to " + communityName(r.Context(), s.q()) + " by email."
	if err := s.tellAccountChanged(r.Context(), s.q(), acct.Email.String, "Your password was removed", line); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// replacePassword stores a password hash, or none, and ends every other session of the user. It writes the error
// response and returns false when it fails.
func (s *Server) replacePassword(w http.ResponseWriter, r *http.Request, userID string, hash sql.NullString) bool {
	if err := s.q().SetUserPassword(r.Context(), store.SetUserPasswordParams{PasswordHash: hash, ID: userID}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if err := s.q().DeleteOtherSessions(r.Context(), store.DeleteOtherSessionsParams{UserID: userID, ID: sessionFrom(r.Context())}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return false
	}
	return true
}
