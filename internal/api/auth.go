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
	// touchAfter is how stale last_seen_at may be before a request refreshes
	// it and the expiry, so most requests do not write.
	touchAfter = 24 * time.Hour
)

type ctxKey int

const (
	userKey ctxKey = iota
	sessionKey
	groupKey
)

// userFrom returns the authenticated user, if the handler is behind requireAuth.
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

// groupFrom is the group named in the path and the user as perm sees them in it (set by requireGroup).
func groupFrom(ctx context.Context) (Group, perm.Actor) {
	g, _ := ctx.Value(groupKey).(groupCtx)
	return g.group, g.actor
}

// tokenFrom reads the session token from the cookie or, for the app shell,
// an Authorization: Bearer header.
func tokenFrom(r *http.Request) string {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if c, err := r.Cookie(cookieName); err == nil {
		return c.Value
	}
	return ""
}

// authenticate resolves the request's session to a user, refreshing the
// session's expiry at most once a day.
func (s *Server) authenticate(r *http.Request) (User, string, bool) {
	token := tokenFrom(r)
	if token == "" {
		return User{}, "", false
	}
	id := auth.HashToken(token)
	now := db.Now()
	row, err := s.q().GetSessionUser(r.Context(), store.GetSessionUserParams{ID: id, Now: now})
	if err != nil {
		return User{}, "", false
	}
	if now-row.LastSeenAt > touchAfter.Milliseconds() {
		s.q().TouchSession(r.Context(), store.TouchSessionParams{LastSeenAt: now, ExpiresAt: now + SessionTTL.Milliseconds(), ID: id})
	}
	return wireUser(row.ID, row.Username, row.PictureID), id, true
}

// requireAuth rejects unauthenticated requests with 401 and puts the user in the context.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, sid, ok := s.authenticate(r)
		if !ok {
			writeErr(w, http.StatusUnauthorized, "sign in first")
			return
		}
		ctx := context.WithValue(r.Context(), userKey, u)
		ctx = context.WithValue(ctx, sessionKey, sid)
		next(w, r.WithContext(ctx))
	}
}

// requireRoot is requireAuth plus a rule about the user's role in the root
// group: the instance's staff are the root group's staff.
func (s *Server) requireRoot(ok func(perm.Actor) bool, next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		u, _ := userFrom(r.Context())
		a, err := actorIn(r.Context(), s.q(), u, perm.Root)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !ok(a) {
			writeErr(w, http.StatusForbidden, "not allowed")
			return
		}
		next(w, r)
	})
}

// Protect is the CSRF guard for the whole server: a state-changing request
// must come from this origin. SameSite=Lax on the cookie covers most
// browsers; this covers the rest and is cheap.
func Protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site == "cross-site" {
			writeErr(w, http.StatusForbidden, "cross-site request refused")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "null" {
			o, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(o.Host, r.Host) {
				writeErr(w, http.StatusForbidden, "cross-site request refused")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// issueSession creates a session for the user and sets the cookie. The token
// is also returned for clients that hold it as a bearer token.
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

// loginLimiter slows password guessing: per address, 5 quick attempts then
// one every 12 seconds. Entries are never evicted; fine for one instance.
type loginLimiter struct {
	mu sync.Mutex
	m  map[string]*rate.Limiter
}

func (l *loginLimiter) allow(addr string) bool {
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
		lim = rate.NewLimiter(rate.Every(12*time.Second), 5)
		l.m[host] = lim
	}
	return lim.Allow()
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.limiter.allow(r.RemoteAddr) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts; wait a moment")
		return
	}
	var in credentials
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	row, err := s.q().GetUserByUsername(r.Context(), in.Username)
	u := wireUser(row.ID, row.Username, row.PictureID)
	hash := row.PasswordHash
	// Same answer for unknown user and wrong password; bcrypt runs either way
	// so timing does not reveal which.
	if errors.Is(err, sql.ErrNoRows) || !hash.Valid {
		auth.CheckPassword("$2a$12$000000000000000000000uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu", in.Password)
		writeErr(w, http.StatusUnauthorized, "wrong username or password")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !auth.CheckPassword(hash.String, in.Password) {
		writeErr(w, http.StatusUnauthorized, "wrong username or password")
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

// logoutAll ends every session of the user, this one included.
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
