package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Group is the wire shape of a group as one viewer sees it: with their role
// in it and what they may do to it (architecture.md, Groups).
type Group struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
	// Mode is the group's one setting: posts, chat or both. A DM is chat.
	Mode      string `json:"mode"`
	CreatedAt int64  `json:"created_at"`
	// LastMessageAt is the time of the group's newest live message, or null:
	// computed on the way out, never stored, so the Messages page can order
	// DMs by latest activity (architecture.md, Layout).
	LastMessageAt *int64   `json:"last_message_at"`
	Role          string   `json:"role,omitempty"`
	Can           GroupCan `json:"can"`
	// Members is set for a DM only: a DM is named by its people, present or away.
	Members []User `json:"members,omitempty"`
	// LeftAt is set when the viewer has stepped out of this conversation:
	// it is listed for them (All messages), and nothing else of it is.
	LeftAt *int64 `json:"left_at,omitempty"`
}

// GroupCan is what the viewer may do to a group. CreateGroups is meaningful
// on the root group only: it carries the instance's group_creation setting.
type GroupCan struct {
	AddMembers    bool `json:"add_members"`
	RemoveMembers bool `json:"remove_members"`
	SetRoles      bool `json:"set_roles"`
	Transfer      bool `json:"transfer"`
	Rename        bool `json:"rename"`
	SetMode       bool `json:"set_mode"`
	Delete        bool `json:"delete"`
	Leave         bool `json:"leave"`
	CreateGroups  bool `json:"create_groups,omitempty"`
	// ManageInstance is meaningful on the root group only: the owner edits instance settings.
	ManageInstance bool `json:"manage_instance,omitempty"`
}

// Settings is the instance's settings on the wire (architecture.md, Feature flags).
type Settings struct {
	GroupCreation string `json:"group_creation"`
}

func (s *Server) settings(ctx context.Context) (Settings, error) {
	v, err := s.q().GetSetting(ctx, "group_creation")
	if errors.Is(err, sql.ErrNoRows) {
		v = perm.CreationAnyone
	} else if err != nil {
		return Settings{}, err
	}
	return Settings{GroupCreation: v}, nil
}

// Membership is one person's place in a group.
type Membership struct {
	GroupID  string `json:"group_id"`
	User     User   `json:"user"`
	Role     string `json:"role"`
	JoinedAt int64  `json:"joined_at"`
	// LeftAt is set while this person has stepped out of a conversation.
	LeftAt *int64 `json:"left_at"`
}

func groupFor(a perm.Actor, g Group, st Settings) Group {
	pg := perm.Group{Kind: g.Kind}
	g.Role = a.Role
	g.Can = GroupCan{
		// In the root group adding is an invite link and nobody is removed (member removal comes with admin tools); nobody is added to a conversation.
		AddMembers:    perm.AddMembers(a, pg),
		RemoveMembers: perm.RemoveMembers(a) && g.Kind == perm.KindGroup,
		SetRoles:      a.Role == perm.Owner,
		Transfer:      a.Role == perm.Owner,
		Rename:        perm.Rename(a, pg),
		SetMode:       perm.SetMode(a, pg),
		Delete:        perm.DeleteGroup(a, pg),
		Leave:         perm.Leave(a, pg),
	}
	if g.Kind == perm.KindRoot {
		g.Can.CreateGroups = perm.CreateGroup(a, st.GroupCreation)
		g.Can.ManageInstance = perm.ManageInstance(a)
	}
	return g
}

// actorIn is the user as perm sees them in one group: their role there, or
// none. Not being a member is not an error; it is an answer.
func actorIn(ctx context.Context, q *store.Queries, u User, groupID string) (perm.Actor, error) {
	row, err := q.GetMembership(ctx, store.GetMembershipParams{GroupID: groupID, UserID: u.ID})
	if errors.Is(err, sql.ErrNoRows) {
		return perm.Actor{ID: u.ID}, nil
	}
	if err != nil {
		return perm.Actor{}, err
	}
	return perm.Actor{ID: u.ID, Role: row.Role}, nil
}

// requireGroup is requireAuth plus membership of the group in the path. A
// non-member gets 404, never 403: to them the group does not exist. The
// group and the actor go in the context.
func (s *Server) requireGroup(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		me, _ := userFrom(r.Context())
		id := r.PathValue("gid")
		row, err := s.q().GetGroup(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "no such group")
			return
		}
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		a, err := actorIn(r.Context(), s.q(), me, id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !perm.CanSee(a) {
			writeErr(w, http.StatusNotFound, "no such group")
			return
		}
		st, err := s.settings(r.Context())
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		g, err := wireGroup(r.Context(), s.q(), row)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		next(w, r.WithContext(withGroup(r.Context(), groupFor(a, g, st), a)))
	})
}

func (s *Server) listGroups(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	rows, err := s.q().ListMyGroups(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	st, err := s.settings(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Group, 0, len(rows))
	for _, row := range rows {
		// The list's row is the group's row plus my role; TestRepliesAndEventsMatchTheRow holds list and fetch to the same shape.
		g, err := wireGroup(r.Context(), s.q(), store.GetGroupRow{ID: row.ID, Kind: row.Kind, Name: row.Name, Mode: row.Mode, CreatedAt: row.CreatedAt, LastMessageAt: row.LastMessageAt})
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		g.LeftAt = nullInt(row.LeftAt)
		out = append(out, groupFor(perm.Actor{ID: me.ID, Role: row.Role}, g, st))
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": out})
}

func (s *Server) getGroup(w http.ResponseWriter, r *http.Request) {
	g, _ := groupFrom(r.Context())
	writeJSON(w, http.StatusOK, g)
}

// createGroup makes a named group with the caller as owner, or a DM: an
// unnamed group of the caller and the given people, all equals. A DM with
// exactly those people already is answered with that one (200, not 201).
func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind    string   `json:"kind"`
		Name    string   `json:"name"`
		Mode    string   `json:"mode"`
		Members []string `json:"members"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	me, _ := userFrom(r.Context())
	root, err := actorIn(r.Context(), s.q(), me, perm.Root)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	st, err := s.settings(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !perm.CreateGroup(root, st.GroupCreation) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	now := db.Now()
	switch in.Kind {
	case "", perm.KindGroup:
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" || len(in.Name) > 80 {
			writeErr(w, http.StatusBadRequest, "a room needs a name of up to 80 characters")
			return
		}
		if in.Mode == "" {
			in.Mode = perm.ModeBoth
		}
		if !validMode(in.Mode) {
			writeErr(w, http.StatusBadRequest, "mode must be posts, chat or both")
			return
		}
		s.createGroupWith(w, r, perm.KindGroup, in.Name, in.Mode, now, map[string]string{me.ID: perm.Owner})
	case perm.KindDM:
		people := map[string]bool{me.ID: true}
		for _, id := range in.Members {
			people[id] = true
		}
		if len(people) < 2 {
			writeErr(w, http.StatusBadRequest, "a conversation needs someone else in it")
			return
		}
		ids := make([]string, 0, len(people))
		for id := range people {
			ids = append(ids, id)
		}
		s.openConversation(w, r, me, ids, now)
	default:
		writeErr(w, http.StatusBadRequest, "kind must be group or dm")
	}
}

// openConversation is the conversation of exactly these people
// (architecture.md, Groups): one per set, keyed by the sorted ids, found or
// made inside one transaction so two openings cannot make two. The viewer
// is one of them; having stepped out, they are present again, which is a
// membership event. The reply is the group, 200 found or 201 made.
func (s *Server) openConversation(w http.ResponseWriter, r *http.Request, me User, people []string, now int64) {
	sort.Strings(people)
	key := sql.NullString{String: strings.Join(people, ","), Valid: true}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	gid := id.String()
	ctx := r.Context()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		row, err := qtx.GetDMByPeople(ctx, key)
		if err == nil {
			g, err := wireGroup(ctx, qtx, store.GetGroupRow(row))
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			m, err := qtx.GetMember(ctx, store.GetMemberParams{GroupID: g.ID, UserID: me.ID})
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			var entries []events.Entry
			if m.LeftAt.Valid {
				if err := qtx.SetMembershipPresent(ctx, store.SetMembershipPresentParams{GroupID: g.ID, UserID: me.ID}); err != nil {
					return nil, nil, http.StatusInternalServerError, err
				}
				if m, err = qtx.GetMember(ctx, store.GetMemberParams{GroupID: g.ID, UserID: me.ID}); err != nil {
					return nil, nil, http.StatusInternalServerError, err
				}
				entries = append(entries, events.Entry{Kind: "membership", Payload: wireMembership(g.ID, m)})
			}
			return entries, &g, http.StatusOK, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusInternalServerError, err
		}
		if err := qtx.CreateGroup(ctx, store.CreateGroupParams{ID: gid, Kind: perm.KindDM, Name: "", Mode: perm.ModeChat, CreatedAt: now, PeopleKey: key}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		for _, uid := range people {
			if _, err := qtx.GetUser(ctx, uid); errors.Is(err, sql.ErrNoRows) {
				return nil, nil, http.StatusBadRequest, errors.New("no such person: " + uid)
			} else if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if err := qtx.CreateMembership(ctx, store.CreateMembershipParams{GroupID: gid, UserID: uid, Role: perm.Member, JoinedAt: now}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
		}
		g, err := qtx.GetGroup(ctx, gid)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		wg, err := wireGroup(ctx, qtx, g)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries := []events.Entry{{Kind: "group", Payload: &wg}}
		for _, uid := range people {
			m, err := qtx.GetMember(ctx, store.GetMemberParams{GroupID: gid, UserID: uid})
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, events.Entry{Kind: "membership", Payload: wireMembership(gid, m)})
		}
		return entries, &wg, http.StatusCreated, nil
	})
}

func validMode(m string) bool { return m == perm.ModePosts || m == perm.ModeChat || m == perm.ModeBoth }

// The reply and the events are read back from the rows after the writes;
// loggedMany personalises the reply for the creator's role in the new group.
func (s *Server) createGroupWith(w http.ResponseWriter, r *http.Request, kind, name, mode string, now int64, people map[string]string) {
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	gid := id.String()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if err := qtx.CreateGroup(r.Context(), store.CreateGroupParams{ID: gid, Kind: kind, Name: name, Mode: mode, CreatedAt: now, PeopleKey: sql.NullString{}}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		for uid, role := range people {
			if _, err := qtx.GetUser(r.Context(), uid); errors.Is(err, sql.ErrNoRows) {
				return nil, nil, http.StatusBadRequest, errors.New("no such person: " + uid)
			} else if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: gid, UserID: uid, Role: role, JoinedAt: now}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
		}
		// Written; now read back what was written, and that is what everyone receives.
		row, err := qtx.GetGroup(r.Context(), gid)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		g, err := wireGroup(r.Context(), qtx, row)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries := []events.Entry{{Kind: "group", Payload: &g}}
		for uid := range people {
			m, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: gid, UserID: uid})
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, events.Entry{Kind: "membership", Payload: wireMembership(gid, m)})
		}
		return entries, &g, http.StatusCreated, nil
	})
}

// updateGroup sets a group's name and its mode (perm.Rename, perm.SetMode).
func (s *Server) updateGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name *string `json:"name"`
		Mode *string `json:"mode"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	g, a := groupFrom(r.Context())
	pg := perm.Group{Kind: g.Kind}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" || len(name) > 80 {
			writeErr(w, http.StatusBadRequest, "a room needs a name of up to 80 characters")
			return
		}
		if !perm.Rename(a, pg) {
			writeErr(w, http.StatusForbidden, "not allowed")
			return
		}
		g.Name = name
	}
	if in.Mode != nil {
		if !validMode(*in.Mode) {
			writeErr(w, http.StatusBadRequest, "mode must be posts, chat or both")
			return
		}
		if g.Kind == perm.KindDM {
			writeErr(w, http.StatusBadRequest, "a DM is chat only")
			return
		}
		if !perm.SetMode(a, pg) {
			writeErr(w, http.StatusForbidden, "not allowed")
			return
		}
		g.Mode = *in.Mode
	}
	s.logged(w, r, "group", db.Now(), func(qtx *store.Queries) (any, int, error) {
		if err := qtx.UpdateGroup(r.Context(), store.UpdateGroupParams{Name: g.Name, Mode: g.Mode, ID: g.ID}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetGroup(r.Context(), g.ID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		updated, err := wireGroup(r.Context(), qtx, row)
		return &updated, http.StatusOK, err
	})
}

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) {
	g, a := groupFrom(r.Context())
	if !perm.DeleteGroup(a, perm.Group{Kind: g.Kind}) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	now := db.Now()
	s.logged(w, r, "group_delete", now, func(qtx *store.Queries) (any, int, error) {
		err := qtx.DeleteGroup(r.Context(), store.DeleteGroupParams{DeletedAt: sql.NullInt64{Int64: now, Valid: true}, ID: g.ID})
		return map[string]string{"id": g.ID}, http.StatusOK, err
	})
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	g, _ := groupFrom(r.Context())
	rows, err := s.q().ListMembers(r.Context(), g.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Membership, 0, len(rows))
	for _, row := range rows {
		out = append(out, wireMembership(g.ID, store.GetMemberRow(row)))
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": out})
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"user_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	g, a := groupFrom(r.Context())
	if !perm.AddMembers(a, perm.Group{Kind: g.Kind}) || g.Kind == perm.KindRoot {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if _, err := qtx.GetUser(r.Context(), in.UserID); errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("no such person")
		} else if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: g.ID, UserID: in.UserID, Role: perm.Member, JoinedAt: now}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, nil, http.StatusConflict, errors.New("already a member")
			}
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: in.UserID})
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m := wireMembership(g.ID, row)
		return []events.Entry{{Kind: "membership", Payload: m}}, m, http.StatusCreated, nil
	})
}

// setMemberRole: the group's owner makes someone a member or a moderator.
func (s *Server) setMemberRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if in.Role != perm.Member && in.Role != perm.Moderator && in.Role != perm.Owner {
		writeErr(w, http.StatusBadRequest, "role must be member, moderator or owner")
		return
	}
	g, a := groupFrom(r.Context())
	me, _ := userFrom(r.Context())
	uid := r.PathValue("uid")
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		target, err := actorIn(r.Context(), qtx, User{ID: uid}, g.ID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(target) {
			return nil, nil, http.StatusNotFound, errors.New("not a member")
		}
		// member reads a membership back after its role was written: the same row, new role, joined time intact.
		member := func(userID string) (Membership, error) {
			row, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: userID})
			return wireMembership(g.ID, row), err
		}
		if in.Role == perm.Owner {
			// Handing over: the target becomes owner, the owner a moderator. Two memberships change.
			if !perm.Transfer(a, target) {
				return nil, nil, http.StatusForbidden, errors.New("not allowed")
			}
			if err := qtx.SetMembershipRole(r.Context(), store.SetMembershipRoleParams{Role: perm.Owner, GroupID: g.ID, UserID: uid}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if err := qtx.SetMembershipRole(r.Context(), store.SetMembershipRoleParams{Role: perm.Moderator, GroupID: g.ID, UserID: me.ID}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			newOwner, err := member(uid)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			oldOwner, err := member(me.ID)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			return []events.Entry{{Kind: "membership", Payload: newOwner}, {Kind: "membership", Payload: oldOwner}}, newOwner, http.StatusOK, nil
		}
		if !perm.SetRole(a, target, in.Role) {
			return nil, nil, http.StatusForbidden, errors.New("not allowed")
		}
		if err := qtx.SetMembershipRole(r.Context(), store.SetMembershipRoleParams{Role: in.Role, GroupID: g.ID, UserID: uid}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m, err := member(uid)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return []events.Entry{{Kind: "membership", Payload: m}}, m, http.StatusOK, nil
	})
}

// removeMember: staff remove anyone but the owner; anyone may remove
// themselves, which is leaving. Neither applies to the root group.
func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) {
	g, a := groupFrom(r.Context())
	uid := r.PathValue("uid")
	me, _ := userFrom(r.Context())
	s.loggedMany(w, r, db.Now(), func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		target, err := actorIn(r.Context(), qtx, User{ID: uid}, g.ID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(target) {
			return nil, nil, http.StatusNotFound, errors.New("not a member")
		}
		pg := perm.Group{Kind: g.Kind}
		allowed := false
		if uid == me.ID {
			allowed = perm.Leave(a, pg)
		} else {
			allowed = perm.RemoveMembers(a) && target.Role != perm.Owner && g.Kind != perm.KindRoot
		}
		if !allowed {
			return nil, nil, http.StatusForbidden, errors.New("not allowed")
		}
		if g.Kind == perm.KindDM {
			// Stepping out of a conversation: the row stays, the person is away, and
			// opening the conversation again is stepping back in (architecture.md, Groups).
			if err := qtx.SetMembershipLeft(r.Context(), store.SetMembershipLeftParams{LeftAt: sql.NullInt64{Int64: db.Now(), Valid: true}, GroupID: g.ID, UserID: uid}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			m, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: uid})
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			// The reply is the membership too, so the leaver's own page lists the conversation as stepped out at once.
			mm := wireMembership(g.ID, m)
			return []events.Entry{{Kind: "membership", Payload: mm}}, mm, http.StatusOK, nil
		}
		if _, err := qtx.DeleteMembership(r.Context(), store.DeleteMembershipParams{GroupID: g.ID, UserID: uid}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		gone := map[string]string{"group_id": g.ID, "user_id": uid}
		entries := []events.Entry{{Kind: "membership_delete", Payload: gone}}
		// The last one out turns off the lights: an empty group is deleted.
		if n, err := qtx.CountMembers(r.Context(), g.ID); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		} else if n == 0 {
			if err := qtx.DeleteGroup(r.Context(), store.DeleteGroupParams{DeletedAt: sql.NullInt64{Int64: db.Now(), Valid: true}, ID: g.ID}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, events.Entry{Kind: "group_delete", Payload: map[string]string{"id": g.ID}})
		}
		return entries, nil, http.StatusNoContent, nil
	})
}

// events is the SSE endpoint, filtered and personalised for the signed-in
// viewer (architecture.md, Realtime). The connection keeps the viewer's
// role per group, updated by their own membership events, so an event for
// a group they are not in is never written.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	viewer, _ := userFrom(r.Context())
	rows, err := s.q().ListMyGroups(r.Context(), viewer.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	roles := map[string]string{}
	for _, row := range rows {
		if !row.LeftAt.Valid {
			roles[row.ID] = row.Role
		}
	}
	st, err := s.settings(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.Hub.Serve(w, r, func(e events.Event) (events.Event, bool) {
		return filterEvent(viewer, roles, &st, e)
	})
}

// getSettings and setSettings: the instance's settings, the root owner's.
func (s *Server) getSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.settings(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) setSettings(w http.ResponseWriter, r *http.Request) {
	var in Settings
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	if in.GroupCreation != perm.CreationAnyone && in.GroupCreation != perm.CreationStaff {
		writeErr(w, http.StatusBadRequest, "group_creation must be anyone or staff")
		return
	}
	s.logged(w, r, "settings", db.Now(), func(qtx *store.Queries) (any, int, error) {
		err := qtx.SetSetting(r.Context(), store.SetSettingParams{Key: "group_creation", Value: in.GroupCreation})
		return in, http.StatusOK, err
	})
}

// filterEvent decides whether one viewer gets one event, and personalises it.
func filterEvent(viewer User, roles map[string]string, st *Settings, e events.Event) (events.Event, bool) {
	inGroup := func(gid string) (perm.Actor, bool) {
		role, ok := roles[gid]
		return perm.Actor{ID: viewer.ID, Role: role}, ok
	}
	encode := func(v any) (events.Event, bool) {
		raw, err := json.Marshal(v)
		if err != nil {
			return e, false
		}
		e.Payload = raw
		return e, true
	}
	switch e.Kind {
	case "post":
		var p Post
		if json.Unmarshal(e.Payload, &p) != nil {
			return e, false
		}
		a, ok := inGroup(p.GroupID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &p, *st))
	case "comment":
		var c Comment
		if json.Unmarshal(e.Payload, &c) != nil {
			return e, false
		}
		a, ok := inGroup(c.GroupID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &c, *st))
	case "message":
		var m Message
		if json.Unmarshal(e.Payload, &m) != nil {
			return e, false
		}
		a, ok := inGroup(m.GroupID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &m, *st))
	case "group":
		var g Group
		if json.Unmarshal(e.Payload, &g) != nil {
			return e, false
		}
		a, ok := inGroup(g.ID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &g, *st))
	case "group_delete":
		var d struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(e.Payload, &d) != nil {
			return e, false
		}
		if _, ok := roles[d.ID]; !ok {
			return e, false
		}
		delete(roles, d.ID)
		return e, true
	case "membership":
		var m Membership
		if json.Unmarshal(e.Payload, &m) != nil {
			return e, false
		}
		if m.User.ID == viewer.ID {
			// My own: in, or stepped out of a conversation. Either way I hear it.
			if m.LeftAt != nil {
				delete(roles, m.GroupID)
			} else {
				roles[m.GroupID] = m.Role
			}
			return e, true
		}
		_, ok := roles[m.GroupID]
		return e, ok
	case "membership_delete":
		var d struct {
			GroupID string `json:"group_id"`
			UserID  string `json:"user_id"`
		}
		if json.Unmarshal(e.Payload, &d) != nil {
			return e, false
		}
		if d.UserID == viewer.ID {
			_, was := roles[d.GroupID]
			delete(roles, d.GroupID)
			return e, was
		}
		_, ok := roles[d.GroupID]
		return e, ok
	case "settings":
		var next Settings
		if json.Unmarshal(e.Payload, &next) == nil {
			*st = next
		}
		return e, true
	default:
		// user, and anything instance-wide: everyone on the instance sees it.
		return e, true
	}
}
