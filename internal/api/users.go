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

// listUsers returns everyone on the instance, which is the root group's
// membership: each person with their instance role, when they joined, and
// whether the viewer may remove them. Private community: any member may
// see the list.
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

// removedName is what a removed account is called: the tail of its id,
// which is the random part of a UUIDv7 (the head is the time, shared by ids
// made in the same instant), and which nobody can register
// (auth.ValidateUsername).
func removedName(id string) string { return "removed-" + id[len(id)-8:] }

// removeUser takes someone off the instance (architecture.md, Admin
// tools), by staff from People or by themselves from Settings. Their posts, comments and messages
// stay under a removed name; each room they own passes by seniority, or
// closes if they were alone; their conversations keep their place in the
// set; their sessions end. The name goes out first, so every open page
// renames their posts, comments and messages before their membership goes.
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
				// A conversation is its people; theirs is hidden, and the name says they are gone.
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
