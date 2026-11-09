package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/mail"
	"sweet/internal/store"
)

// This file implements signing in by email. A
// sign-in email holds a link and a six-digit code for one token. The code
// works only in the browser that asked for the email, which the sweet_signin
// cookie identifies. The link opens a page whose button uses it, in any
// browser. Using either one uses the token.

const (
	signinCookie = "sweet_signin"
	// maxWrongCodes voids a token after that many wrong codes.
	maxWrongCodes = 5
	// maxWrongCodesPerDay refuses every code of a user, even a right one, after that many wrong codes in a day across
	// their tokens. The link still works.
	maxWrongCodesPerDay = 10
)

// userByLogin finds an account by username, or by email address when the login contains @.
func userByLogin(ctx context.Context, q *store.Queries, login string) (store.GetUserByUsernameRow, error) {
	login = strings.TrimSpace(login)
	if strings.Contains(login, "@") {
		e, err := q.GetUserByEmail(ctx, login)
		return store.GetUserByUsernameRow(e), err
	}
	return q.GetUserByUsername(ctx, login)
}

// signinRequest returns the hash of the browser's sign-in cookie. It sets a
// new cookie when the browser has none and renews the existing one
// otherwise, so every email asked for in one browser accepts its codes there.
func signinRequest(w http.ResponseWriter, r *http.Request) (string, error) {
	value := ""
	if c, err := r.Cookie(signinCookie); err == nil {
		value = c.Value
	}
	if value == "" {
		token, _, err := auth.NewToken()
		if err != nil {
			return "", err
		}
		value = token
	}
	http.SetCookie(w, &http.Cookie{
		Name: signinCookie, Value: value, Path: "/api/signin", MaxAge: int(signinTTL.Seconds()),
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteStrictMode,
	})
	return auth.HashToken(value), nil
}

// requestHash returns the hash of the browser's sign-in cookie, or "" when it has none.
func requestHash(r *http.Request) string {
	if c, err := r.Cookie(signinCookie); err == nil && c.Value != "" {
		return auth.HashToken(c.Value)
	}
	return ""
}

// clearSigninCookie deletes the browser's sign-in cookie once it has signed in.
func clearSigninCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: signinCookie, Value: "", Path: "/api/signin", MaxAge: -1, HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteStrictMode})
}

// codeHash binds a code to its token, so the same code in two tokens has two hashes.
func codeHash(tokenHash, code string) string { return auth.HashToken(tokenHash + ":" + code) }

// sendSignin creates a sign-in token for a user and an address, bound to the
// requesting browser, and emails its link and code. It sends nothing when the
// user has had tokensPerHour sign-in emails in the last hour. joining words
// the email as the last step of joining.
func (s *Server) sendSignin(ctx context.Context, q *store.Queries, userID, email, request string, joining bool) error {
	if full, err := rationed(ctx, q, userID, TokenSignin); err != nil || full {
		return err
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		return err
	}
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return err
	}
	code := fmt.Sprintf("%06d", n.Int64())
	now := db.Now()
	if err := q.CreateEmailToken(ctx, store.CreateEmailTokenParams{
		Hash: hash, UserID: userID, Kind: TokenSignin, Email: email,
		CodeHash:    sql.NullString{String: codeHash(hash, code), Valid: true},
		RequestHash: sql.NullString{String: request, Valid: request != ""},
		CreatedAt:   now, ExpiresAt: now + signinTTL.Milliseconds(),
	}); err != nil {
		return err
	}
	community := communityName(ctx, q)
	c := mail.Content{
		Community: community,
		Heading:   "Sign in to " + community,
		Lines:     []string{"Open the link or type the code on the sign-in page to sign in to " + community + "."},
		Code:      code,
		Action:    &mail.Action{Label: "Finish signing in", URL: s.BaseURL + "/signin/" + token},
		Note:      "The link and the code work once, for 15 minutes. If you did not ask to sign in, ignore this email.",
	}
	subject := "Sign in to " + community
	if joining {
		c.Heading = "Finish joining " + community
		c.Lines = []string{"Open the link or type the code where you joined to finish joining " + community + "."}
		c.Action.Label = "Finish joining"
		subject = "Finish joining " + community
	}
	return s.sendMail(ctx, c.Message(email, subject))
}

// requestSignin is `POST /api/signin/email {login}`. The login is a username
// or an email address. The answer is 202 whether or not an account matches,
// so the endpoint reveals nothing about existing accounts. An account that
// matches, is not removed and has an address is sent a sign-in email. The
// address need not be verified, because signing in with it verifies it.
func (s *Server) requestSignin(w http.ResponseWriter, r *http.Request) {
	if !s.mailLimiter.allow(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		Login string `json:"login"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || strings.TrimSpace(in.Login) == "" {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	request, err := signinRequest(w, r)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	row, err := userByLogin(r.Context(), s.q(), in.Login)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err == nil && !row.RemovedAt.Valid && row.Email.Valid {
		if err := s.sendSignin(r.Context(), s.q(), row.ID, row.Email.String, request, false); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusAccepted)
}

// signinCode is `POST /api/signin/code {code}`. It signs in the browser that
// asked for the email when the code matches one of that browser's usable
// tokens. A wrong code counts against the newest token, and the fifth voids
// it. Spaces in the code are ignored.
func (s *Server) signinCode(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Code string `json:"code"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	code := strings.Join(strings.Fields(in.Code), "")
	wrong := func() { writeErr(w, http.StatusBadRequest, "That code is wrong or has expired") }
	request := requestHash(r)
	if request == "" || len(code) != 6 {
		wrong()
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
	now := db.Now()
	tokens, err := qtx.ListSigninTokensForRequest(ctx, store.ListSigninTokensForRequestParams{RequestHash: sql.NullString{String: request, Valid: true}, Now: now})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(tokens) == 0 {
		wrong()
		return
	}
	var match *store.ListSigninTokensForRequestRow
	for i, t := range tokens {
		if subtle.ConstantTimeCompare([]byte(t.CodeHash.String), []byte(codeHash(t.Hash, code))) == 1 {
			match = &tokens[i]
			break
		}
	}
	user := tokens[0].UserID
	if match != nil {
		user = match.UserID
	}
	wrongToday, err := qtx.CountWrongCodesSince(ctx, store.CountWrongCodesSinceParams{UserID: user, Since: now - (24 * time.Hour).Milliseconds()})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if wrongToday >= maxWrongCodesPerDay {
		writeErr(w, http.StatusTooManyRequests, "Too many wrong codes today. Use the link in the email instead.")
		return
	}
	if match == nil {
		if err := qtx.AddWrongCode(ctx, store.AddWrongCodeParams{MaxAttempts: maxWrongCodes, Now: sql.NullInt64{Int64: now, Valid: true}, Hash: tokens[0].Hash}); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := tx.Commit(); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		wrong()
		return
	}
	if n, err := qtx.UseEmailToken(ctx, store.UseEmailTokenParams{UsedAt: sql.NullInt64{Int64: now, Valid: true}, Hash: match.Hash, Now: now}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	} else if n == 0 {
		wrong()
		return
	}
	s.completeSignin(w, r, tx, qtx, match.UserID, match.Email, wrong)
}

// signinLink is `POST /api/signin/link {token}`. The link's page calls it
// when its Finish signing in button is pressed, and it signs in that browser.
func (s *Server) signinLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Token == "" {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	gone := func() { writeErr(w, http.StatusNotFound, "This link has been used or has expired") }
	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	qtx := store.New(tx)
	tok, err := useToken(ctx, qtx, in.Token, TokenSignin)
	if errors.Is(err, errNotFound) {
		gone()
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.completeSignin(w, r, tx, qtx, tok.UserID, tok.Email, gone)
}

// completeSignin finishes a sign-in by email for a used token. The account's
// address is verified when the token went to it. It commits the transaction,
// deletes the browser's sign-in cookie and issues a session. refused writes
// the response for an account that cannot sign in.
func (s *Server) completeSignin(w http.ResponseWriter, r *http.Request, tx *sql.Tx, qtx *store.Queries, userID, email string, refused func()) {
	ctx := r.Context()
	acct, err := qtx.GetAccount(ctx, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if acct.RemovedAt.Valid {
		refused()
		return
	}
	if acct.Email.Valid && strings.EqualFold(acct.Email.String, email) {
		if err := qtx.SetUserEmailVerifiedAt(ctx, store.SetUserEmailVerifiedAtParams{VerifiedAt: sql.NullInt64{Int64: db.Now(), Valid: true}, ID: userID}); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	u, err := qtx.GetUser(ctx, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	clearSigninCookie(w, r)
	token, err := s.issueSession(w, r, userID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": wireUser(u.ID, u.Username, u.PictureID), "token": token})
}

// signinAddress is `POST /api/signin/address {email}`. It changes the address
// of an account that has never been verified, from the browser that joined,
// for a mistyped address. The new address replaces the old one, the old
// address's links are voided, and a new sign-in email goes to the new
// address. An address that belongs to another account gets the same 202, and
// that account's owner is emailed.
func (s *Server) signinAddress(w http.ResponseWriter, r *http.Request) {
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
	email := strings.TrimSpace(in.Email)
	if err := auth.ValidateEmail(email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	notHere := func() {
		writeErr(w, http.StatusForbidden, "The address can be changed here only from the browser you joined from, before you first sign in")
	}
	request := requestHash(r)
	if request == "" {
		notHere()
		return
	}
	ctx := r.Context()
	u, err := s.q().GetRequestUser(ctx, store.GetRequestUserParams{RequestHash: sql.NullString{String: request, Valid: true}, Now: db.Now()})
	if errors.Is(err, sql.ErrNoRows) || (err == nil && (u.EmailVerifiedAt.Valid || u.RemovedAt.Valid)) {
		notHere()
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	n, err := s.q().SetUnverifiedEmail(ctx, store.SetUnverifiedEmailParams{Email: sql.NullString{String: email, Valid: true}, ID: u.ID})
	if db.IsUniqueViolation(err) {
		if err := s.tellAddressTaken(ctx, email); err != nil {
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
		notHere()
		return
	}
	if err := s.q().VoidUserTokensOfKind(ctx, store.VoidUserTokensOfKindParams{Now: sql.NullInt64{Int64: db.Now(), Valid: true}, UserID: u.ID, Kind: TokenSignin}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.sendSignin(ctx, s.q(), u.ID, email, request, true); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
}
