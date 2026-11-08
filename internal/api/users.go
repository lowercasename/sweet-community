package api

import (
	"database/sql"
	"errors"
	"net/http"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// listUsers returns every user on the instance, which is the root group's
// membership. Each entry has the user's instance role, when they joined, and
// whether the viewer may remove them. The community is private, so any
// member may see the list.
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	a, err := actorIn(r.Context(), s.q(), me, perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rows, err := s.q().ListMembers(r.Context(), perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	type can struct {
		Remove bool `json:"remove"`
	}
	type member struct {
		User
		Role     string `json:"role"`
		JoinedAt int64  `json:"joined_at"`
		Can      can    `json:"can"`
	}
	out := make([]member, 0, len(rows))
	for _, row := range rows {
		out = append(out, member{
			User:     wireUser(row.ID, row.Username, row.PictureID),
			Role:     row.Role,
			JoinedAt: row.JoinedAt,
			Can:      can{Remove: perm.RemoveFromInstance(a, perm.Actor{ID: row.ID, Role: row.Role})},
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

// removedName returns the username given to a removed account. It uses the
// last eight characters of the id, which are the random part of a UUIDv7.
// The first part is the time and is shared by ids made in the same instant.
// Nobody can register a name with this prefix (auth.ValidateUsername).
func removedName(id string) string { return "removed-" + id[len(id)-8:] }

// removeUser removes a user from the instance (architecture.md, Admin
// tools). Staff do this from People, or the user does it themselves from
// Settings. The user's posts, comments and messages remain under a removed
// name. Each room they own passes to the next most senior member, or is
// deleted if they were the only member. Their conversation memberships are
// hidden rather than deleted. Their sessions are deleted. The user event is
// logged first, so every open page renames their posts, comments and
// messages before their memberships are removed.
func (s *Server) removeUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me, _ := userFrom(ctx)
	uid := r.PathValue("id")
	a, err := actorIn(ctx, s.q(), me, perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	target, err := actorIn(ctx, s.q(), User{ID: uid}, perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !perm.RemoveFromInstance(a, target) {
		writeErr(w, http.StatusForbidden, "Not allowed")
		return
	}
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if err := qtx.RemoveUser(ctx, store.RemoveUserParams{Username: removedName(uid), RemovedAt: sql.NullInt64{Int64: now, Valid: true}, ID: uid}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		u, err := qtx.GetUser(ctx, uid)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries := []events.Entry{{Kind: "user", Payload: wireUser(u.ID, u.Username, u.PictureID)}}
		rows, err := qtx.ListUserMemberships(ctx, uid)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		for _, m := range rows {
			if m.Kind == perm.KindDM {
				// A conversation is identified by its members, so the membership is
				// hidden rather than deleted. The removed name shows that the user is gone.
				if err := qtx.HideMembership(ctx, store.HideMembershipParams{HiddenAt: sql.NullInt64{Int64: now, Valid: true}, GroupID: m.GroupID, UserID: uid}); err != nil {
					return nil, nil, http.StatusInternalServerError, err
				}
				continue
			}
			if m.Role == perm.Owner && m.Kind == perm.KindGroup {
				next, err := qtx.NextOwner(ctx, store.NextOwnerParams{GroupID: m.GroupID, UserID: uid})
				if err == nil {
					if err := qtx.SetMembershipRole(ctx, store.SetMembershipRoleParams{Role: perm.Owner, GroupID: m.GroupID, UserID: next}); err != nil {
						return nil, nil, http.StatusInternalServerError, err
					}
					nm, err := qtx.GetMember(ctx, store.GetMemberParams{GroupID: m.GroupID, UserID: next})
					if err != nil {
						return nil, nil, http.StatusInternalServerError, err
					}
					entries = append(entries, events.Entry{Kind: "membership", Payload: wireMembership(m.GroupID, nm)})
				} else if !errors.Is(err, sql.ErrNoRows) {
					return nil, nil, http.StatusInternalServerError, err
				}
			}
			if _, err := qtx.DeleteMembership(ctx, store.DeleteMembershipParams{GroupID: m.GroupID, UserID: uid}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, events.Entry{Kind: "membership_delete", Payload: map[string]string{"group_id": m.GroupID, "user_id": uid}})
			if m.Kind == perm.KindGroup {
				n, err := qtx.CountMembers(ctx, m.GroupID)
				if err != nil {
					return nil, nil, http.StatusInternalServerError, err
				}
				if n == 0 {
					if err := qtx.DeleteGroup(ctx, store.DeleteGroupParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: m.GroupID}); err != nil {
						return nil, nil, http.StatusInternalServerError, err
					}
					entries = append(entries, events.Entry{Kind: "group_delete", Payload: map[string]string{"id": m.GroupID}})
				}
			}
		}
		if err := qtx.DeleteUserSessions(ctx, uid); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return entries, nil, http.StatusNoContent, nil
	})
}
