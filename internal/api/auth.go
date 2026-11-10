package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/store"
)

const (
	cookieName = "sweet_session"
	// SessionTTL is the rolling lifetime of a session.
	SessionTTL = 180 * 24 * time.Hour
	// touchAfter is the age last_seen_at must reach before a request updates
	// it and the expiry. Most requests therefore do not write.
	touchAfter = 24 * time.Hour
)

type ctxKey int

const (
	userKey ctxKey = iota
	sessionKey
	groupKey
)

// userFrom returns the authenticated user when the handler is wrapped by requireAuth.
func userFrom(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userKey).(User)
	return u, ok
}

func sessionFrom(ctx context.Context) string {
	s, _ := ctx.Value(sessionKey).(string)
	return s
}

type groupCtx struct {
	group Group
	actor perm.Actor
}

func withGroup(ctx context.Context, g Group, a perm.Actor) context.Context {
	return context.WithValue(ctx, groupKey, groupCtx{g, a})
}

// groupFrom returns the group in the request path and the user's Actor in it. Both are set by requireGroup.
func groupFrom(ctx context.Context) (Group, perm.Actor) {
	g, _ := ctx.Value(groupKey).(groupCtx)
	return g.group, g.actor
}

// tokenFrom reads the session token from the cookie or, for the app shell,
// from an Authorization: Bearer header.
func tokenFrom(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie(cookieName); err == nil {
		return c.Value
	}
	return ""
}

// authenticate resolves the request's session to a user. It refreshes the
// session's expiry at most once a day.
func (s *Server) authenticate(r *http.Request) (User, string, bool) {
	token := tokenFrom(r)
	if token == "" {
		return User{}, "", false
	}
	id := auth.HashToken(token)
	row, err := s.sessionUser(r.Context(), id)
	if err != nil {
		return User{}, "", false
	}
	now := db.Now()
	if now-row.LastSeenAt > touchAfter.Milliseconds() {
		s.q().TouchSession(r.Context(), store.TouchSessionParams{LastSeenAt: now, ExpiresAt: now + SessionTTL.Milliseconds(), ID: id})
	}
	return wireUser(row.ID, row.Username, row.PictureID), id, true
}

// sessionUser reads the user of a live session: one that exists, has not expired, and belongs to an account that has
// not been removed. It returns sql.ErrNoRows for any other session. Requests and open event streams both use it.
func (s *Server) sessionUser(ctx context.Context, id string) (store.GetSessionUserRow, error) {
	return s.q().GetSessionUser(ctx, store.GetSessionUserParams{ID: id, Now: db.Now()})
}

// requireAuth rejects unauthenticated requests with 401 and puts the user in the context.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, sid, ok := s.authenticate(r)
		if !ok {
			writeErr(w, http.StatusUnauthorized, "Sign in first")
			return
		}
		ctx := context.WithValue(r.Context(), userKey, u)
		ctx = context.WithValue(ctx, sessionKey, sid)
		next(w, r.WithContext(ctx))
	}
}

// requireRoot is requireAuth plus a check of the user's role in the root
// group. The instance's staff are the root group's staff.
func (s *Server) requireRoot(ok func(perm.Actor) bool, next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userFrom(r.Context())
		a, err := actorIn(r.Context(), s.q(), u, perm.Root)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !ok(a) {
			writeErr(w, http.StatusForbidden, "Not allowed")
			return
		}
		next(w, r)
	})
}

// Protect is the CSRF guard for the whole server. A state-changing request
// must come from this origin. SameSite=Lax on the cookie covers most
// browsers. This check covers the rest and is cheap.
func Protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" {
			writeErr(w, http.StatusForbidden, "Cross-site request refused")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "null" {
			o, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(o.Host, r.Host) {
				writeErr(w, http.StatusForbidden, "Cross-site request refused")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// contentSecurityPolicy allows scripts, images, fonts, connections, the
// manifest and the service worker from the server's own origin only. Styles
// may also be inline, because the editor (TipTap) adds its own style element.
// No page may frame Sweet, and plugins and base URLs are refused.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; " +
	"object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

// SecurityHeaders sets the security headers on every response. HSTS is sent only over
// HTTPS.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		// Links in posts lead to other sites. They are told nothing about the page the link was on.
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if isHTTPS(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

// issueSession creates a session for the user and sets the cookie. The token
// is also returned for clients that send it as a bearer token.
func (s *Server) issueSession(w http.ResponseWriter, r *http.Request, userID string) (string, error) {
	token, hash, err := auth.NewToken()
	if err != nil {
		return "", err
	}
	now := db.Now()
	if err := s.q().CreateSession(r.Context(), store.CreateSessionParams{
		ID: hash, UserID: userID, CreatedAt: now, LastSeenAt: now, ExpiresAt: now + SessionTTL.Milliseconds(),
	}); err != nil {
		return "", err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
	})
	return token, nil
}

func clearCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: isHTTPS(r), SameSite: http.SameSiteLaxMode,
	})
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// loginLimiter slows password guessing. Per address, it allows 5 attempts at
// once and then one every 12 seconds. Other limits set every and burst, and
// may key by something other than an address, such as a user id. Entries are
// never evicted, which is acceptable for one instance.
type loginLimiter struct {
	mu    sync.Mutex
	m     map[string]*rate.Limiter
	every time.Duration
	burst int
}

func (l *loginLimiter) get(addr string) *rate.Limiter {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.m == nil {
		l.m = map[string]*rate.Limiter{}
	}
	lim, ok := l.m[host]
	if !ok {
		every, burst := 12*time.Second, 5
		if l.every > 0 {
			every, burst = l.every, l.burst
		}
		lim = rate.NewLimiter(rate.Every(every), burst)
		l.m[host] = lim
	}
	return lim
}

// allow consumes one attempt. Five are allowed at once, then one every twelve seconds.
func (l *loginLimiter) allow(addr string) bool { return l.get(addr).Allow() }

// open reports whether an attempt would be allowed, without consuming one.
// spend consumes one. Sign-in consumes an attempt only on failure, because
// the limit exists for wrong passwords. A correct password or an unverified
// address is not a guess.
func (l *loginLimiter) open(addr string) bool { return l.get(addr).Tokens() >= 1 }
func (l *loginLimiter) spend(addr string)     { l.get(addr).Allow() }

// clientAddr returns the client's address for the limiters. Without proxies
// it is the socket's remote address. Behind ProxyHops proxies it is the entry
// that many places from the right of X-Forwarded-For. Each proxy adds the
// address it saw to the right, after whatever the client sent, so the client
// can write the entries on the left but not that one. Until 2026-11-08 the
// first entry was used, which any client could choose (security audit). A
// header with fewer entries than proxies came through fewer proxies, and its
// first entry is used.
func (s *Server) clientAddr(r *http.Request) string {
	if s.ProxyHops <= 0 {
		return r.RemoteAddr
	}
	var entries []string
	for _, e := range strings.Split(r.Header.Get("X-Forwarded-For"), ",") {
		if e = strings.TrimSpace(e); e != "" {
			entries = append(entries, e)
		}
	}
	if len(entries) == 0 {
		return r.RemoteAddr
	}
	if len(entries) < s.ProxyHops {
		return entries[0]
	}
	return entries[len(entries)-s.ProxyHops]
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.open(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in credentials
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	// The username field accepts a username or an email address. An account with no password gets the same answer
	// as a wrong password.
	row, err := userByLogin(r.Context(), s.q(), in.Username)
	u := wireUser(row.ID, row.Username, row.PictureID)
	hash := row.PasswordHash
	// An unknown user and a wrong password get the same response. The hash
	// is computed in both cases so that timing does not reveal which.
	if errors.Is(err, sql.ErrNoRows) || !hash.Valid {
		auth.CheckPassword(auth.DummyHash, in.Password)
		s.limiter.spend(s.clientAddr(r))
		writeErr(w, http.StatusUnauthorized, "Wrong username or password")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !auth.CheckPassword(hash.String, in.Password) {
		s.limiter.spend(s.clientAddr(r))
		writeErr(w, http.StatusUnauthorized, "Wrong username or password")
		return
	}
	// An account with an email address can sign in only once the address is
	// verified. The owner created at the command line has no address and is
	// allowed in.
	if row.Email.Valid && !row.EmailVerifiedAt.Valid {
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "unverified", "email": row.Email.String})
		return
	}
	token, err := s.issueSession(w, r, u.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "token": token})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	s.q().DeleteSession(r.Context(), sessionFrom(r.Context()))
	clearCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

// logoutAll deletes every session of the user, including the current one.
func (s *Server) logoutAll(w http.ResponseWriter, r *http.Request) {
	u, _ := userFrom(r.Context())
	s.q().DeleteUserSessions(r.Context(), u.ID)
	clearCookie(w, r)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, _ := userFrom(r.Context())
	writeJSON(w, http.StatusOK, u)
}
