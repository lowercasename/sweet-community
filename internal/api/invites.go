package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// InviteTTL is how long an invite link is valid.
const InviteTTL = 7 * 24 * time.Hour

type Invite struct {
	Code      string `json:"code"`
	URL       string `json:"url"`
	CreatedBy User   `json:"created_by"`
	CreatedAt int64  `json:"created_at"`
	ExpiresAt int64  `json:"expires_at"`
	// Uses is the number of users who have joined through this link.
	Uses int64 `json:"uses"`
}

// createInvite (owner) creates a link that anyone who has it can use for InviteTTL.
func (s *Server) createInvite(w http.ResponseWriter, r *http.Request) {
	u, _ := userFrom(r.Context())
	code, err := auth.NewCode()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := db.Now()
	inv := Invite{Code: code, URL: "/join/" + code, CreatedBy: u, CreatedAt: now, ExpiresAt: now + InviteTTL.Milliseconds()}
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if err := qtx.CreateInvite(r.Context(), store.CreateInviteParams{Code: inv.Code, CreatedBy: u.ID, CreatedAt: inv.CreatedAt, ExpiresAt: inv.ExpiresAt}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return nil, inv, http.StatusCreated, nil
	})
}

// listInvites (owner) returns the links that are still valid.
func (s *Server) listInvites(w http.ResponseWriter, r *http.Request) {
	rows, err := s.q().ListOpenInvites(r.Context(), db.Now())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Invite, 0, len(rows))
	for _, row := range rows {
		out = append(out, Invite{
			Code: row.Code, URL: "/join/" + row.Code, CreatedAt: row.CreatedAt, ExpiresAt: row.ExpiresAt, Uses: row.Uses,
			CreatedBy: wireUser(row.CreatorID, row.CreatorUsername, row.CreatorPictureID),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": out})
}

// deleteInvite (owner) revokes a valid link.
func (s *Server) deleteInvite(w http.ResponseWriter, r *http.Request) {
	s.loggedMany(w, r, db.Now(), func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		n, err := qtx.DeleteOpenInvite(r.Context(), r.PathValue("code"))
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if n == 0 {
			return nil, nil, http.StatusNotFound, errors.New("No such invite")
		}
		return nil, nil, http.StatusNoContent, nil
	})
}

// getInvite (public) returns whether a link is valid and who created it, for the join page.
func (s *Server) getInvite(w http.ResponseWriter, r *http.Request) {
	by, err := s.q().GetOpenInviteCreator(r.Context(), store.GetOpenInviteCreatorParams{Code: r.PathValue("code"), Now: db.Now()})
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "This invite link has expired or been revoked")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The join page shows the rules, which a person agrees to by joining.
	rules, err := rulesText.of(r.Context(), s.q())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"invited_by": by, "rules_html": rules.BodyHTML})
}

// register (public) creates an account with no password from a valid invite, and sends the first sign-in email.
func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	if !s.registerLimiter.open(s.clientAddr(r)) {
		writeErr(w, http.StatusTooManyRequests, "Too many attempts. Wait a moment and try again.")
		return
	}
	var in struct {
		Code     string `json:"code"`
		Username string `json:"username"`
		Email    string `json:"email"`
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
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	proof, proofHash, err := auth.NewToken()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	u := User{ID: id.String(), Username: in.Username}
	now := db.Now()

	ctx := r.Context()
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()
	qtx := store.New(tx)
	// Check the invite before anything else. A bad code returns 404 before any username or email is
	// looked up, so the endpoint reveals nothing about existing accounts. The transaction rolls back
	// on every error path below, which releases the invite again.
	n, err := qtx.UseInvite(ctx, store.UseInviteParams{Code: in.Code, Now: now})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if n == 0 {
		s.registerLimiter.spend(s.clientAddr(r))
		writeErr(w, http.StatusNotFound, "This invite link has expired or been revoked")
		return
	}
	if _, err := qtx.GetUserByEmail(ctx, in.Email); err == nil {
		// The address already has an account. Respond exactly as for a new registration (202 with
		// the address), so an invite holder cannot test whether an address is registered. Email the
		// existing account about the attempt. The rollback leaves the invite unused.
		tx.Rollback()
		if err := s.tellAddressTaken(ctx, in.Email); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		// An unbound cookie keeps the response indistinguishable from a new registration.
		setRegistrationCookie(w, r, proof)
		if _, err := signinRequest(w, r); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"email": in.Email})
		return
	}
	if err := qtx.CreateUserWithEmail(ctx, store.CreateUserWithEmailParams{
		ID: u.ID, Username: u.Username, Email: sql.NullString{String: in.Email, Valid: true}, CreatedAt: now,
		RegistrationHash: sql.NullString{String: proofHash, Valid: true}, RegistrationExpiresAt: sql.NullInt64{Int64: now + registrationTTL.Milliseconds(), Valid: true},
	}); err != nil {
		if db.IsUniqueViolation(err) {
			writeErr(w, http.StatusConflict, auth.ErrUsernameTaken.Error())
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// A new account is a membership of the root group, which produces a
	// membership event, so every user's People page receives the new user.
	if err := qtx.CreateMembership(ctx, store.CreateMembershipParams{GroupID: perm.Root, UserID: u.ID, Role: perm.Member, JoinedAt: now}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	joined, err := qtx.GetMember(ctx, store.GetMemberParams{GroupID: perm.Root, UserID: u.ID})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	m := wireMembership(perm.Root, joined)
	u = m.User // use the row's values, which are what the event carries
	_, err = events.Log(ctx, tx, "membership", m, now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The community's chat says that they joined.
	line, err := chatLine(ctx, qtx, perm.Root, JoinedKind, u.ID, "", now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, err = events.Log(ctx, tx, line.Kind, line.Payload, now)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// The owner and every moderator are notified of each new member.
	staff, err := qtx.ListMembers(ctx, perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, m := range staff {
		if m.Role != perm.Owner && m.Role != perm.Moderator {
			continue
		}
		entry, err := notify(r, qtx, NotifyJoined, m.ID, u.ID, perm.Root, nil, now)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if entry != nil {
			_, err := events.Log(ctx, tx, entry.Kind, entry.Payload, now)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}
	if err := tx.Commit(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	setRegistrationCookie(w, r, proof)
	s.Hub.Notify()
	// No session is issued yet. The first sign-in email finishes joining, and using it verifies the address. Its code
	// works in this browser, which the sign-in cookie identifies.
	request, err := signinRequest(w, r)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.sendSignin(ctx, s.q(), u.ID, in.Email, request, true); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"email": in.Email})
}
