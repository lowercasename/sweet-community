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
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Name      string   `json:"name"`
	CreatedAt int64    `json:"created_at"`
	Role      string   `json:"role,omitempty"`
	Can       GroupCan `json:"can"`
}

// GroupCan is what the viewer may do to a group.
type GroupCan struct {
	AddMembers    bool `json:"add_members"`
	RemoveMembers bool `json:"remove_members"`
	SetRoles      bool `json:"set_roles"`
	Rename        bool `json:"rename"`
	Delete        bool `json:"delete"`
	Leave         bool `json:"leave"`
}

// Membership is one person's place in a group.
type Membership struct {
	GroupID  string `json:"group_id"`
	User     User   `json:"user"`
	Role     string `json:"role"`
	JoinedAt int64  `json:"joined_at"`
}

func groupFor(a perm.Actor, g Group) Group {
	pg := perm.Group{Kind: g.Kind}
	g.Role = a.Role
	g.Can = GroupCan{
		AddMembers:    perm.AddMembers(a),
		RemoveMembers: perm.RemoveMembers(a),
		SetRoles:      a.Role == perm.Owner,
		Rename:        perm.Rename(a, pg),
		Delete:        perm.DeleteGroup(a, pg),
		Leave:         perm.Leave(a, pg),
	}
	return g
}

// actorIn is the user as perm sees them in one group: their role there, or
// none. Not being a member is not an error; it is an answer.
func actorIn(ctx context.Context, q *store.Queries, u User, groupID string) (perm.Actor, error) {
	role, err := q.GetMembership(ctx, store.GetMembershipParams{GroupID: groupID, UserID: u.ID})
	if errors.Is(err, sql.ErrNoRows) {
		return perm.Actor{ID: u.ID}, nil
	}
	if err != nil {
		return perm.Actor{}, err
	}
	return perm.Actor{ID: u.ID, Role: role}, nil
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
		g := Group{ID: row.ID, Kind: row.Kind, Name: row.Name, CreatedAt: row.CreatedAt}
		next(w, r.WithContext(withGroup(r.Context(), groupFor(a, g), a)))
	})
}

func (s *Server) listGroups(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	rows, err := s.q().ListMyGroups(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]Group, 0, len(rows))
	for _, row := range rows {
		a := perm.Actor{ID: me.ID, Role: row.Role}
		out = append(out, groupFor(a, Group{ID: row.ID, Kind: row.Kind, Name: row.Name, CreatedAt: row.CreatedAt}))
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
	if !perm.CreateGroup(root) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	now := db.Now()
	switch in.Kind {
	case "", perm.KindGroup:
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" || len(in.Name) > 80 {
			writeErr(w, http.StatusBadRequest, "a group needs a name of up to 80 characters")
			return
		}
		s.createGroupWith(w, r, perm.KindGroup, in.Name, now, map[string]string{me.ID: perm.Owner})
	case perm.KindDM:
		people := map[string]string{me.ID: perm.Member}
		for _, id := range in.Members {
			people[id] = perm.Member
		}
		if len(people) < 2 {
			writeErr(w, http.StatusBadRequest, "a DM needs someone else in it")
			return
		}
		if existing, err := s.findDM(r, me.ID, people); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		} else if existing != "" {
			row, err := s.q().GetGroup(r.Context(), existing)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, groupFor(perm.Actor{ID: me.ID, Role: perm.Member}, Group{ID: row.ID, Kind: row.Kind, Name: row.Name, CreatedAt: row.CreatedAt}))
			return
		}
		s.createGroupWith(w, r, perm.KindDM, "", now, people)
	default:
		writeErr(w, http.StatusBadRequest, "kind must be group or dm")
	}
}

// findDM looks for a DM of the viewer whose members are exactly `people`.
func (s *Server) findDM(r *http.Request, viewerID string, people map[string]string) (string, error) {
	rows, err := s.q().ListMyDMMembers(r.Context(), viewerID)
	if err != nil {
		return "", err
	}
	sets := map[string][]string{}
	for _, row := range rows {
		sets[row.GroupID] = append(sets[row.GroupID], row.UserID)
	}
	want := make([]string, 0, len(people))
	for id := range people {
		want = append(want, id)
	}
	sort.Strings(want)
	for gid, members := range sets {
		sort.Strings(members)
		if strings.Join(members, ",") == strings.Join(want, ",") {
			return gid, nil
		}
	}
	return "", nil
}

func (s *Server) createGroupWith(w http.ResponseWriter, r *http.Request, kind, name string, now int64, people map[string]string) {
	me, _ := userFrom(r.Context())
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	g := Group{ID: id.String(), Kind: kind, Name: name, CreatedAt: now}
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if err := qtx.CreateGroup(r.Context(), store.CreateGroupParams{ID: g.ID, Kind: g.Kind, Name: g.Name, CreatedAt: now}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries := []events.Entry{{Kind: "group", Payload: g}}
		for uid, role := range people {
			row, err := qtx.GetUser(r.Context(), uid)
			if errors.Is(err, sql.ErrNoRows) {
				return nil, nil, http.StatusBadRequest, errors.New("no such person: " + uid)
			}
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: g.ID, UserID: uid, Role: role, JoinedAt: now}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			u := User{ID: row.ID, Username: row.Username, Picture: pictureURL(row.PictureID)}
			entries = append(entries, events.Entry{Kind: "membership", Payload: Membership{GroupID: g.ID, User: u, Role: role, JoinedAt: now}})
		}
		return entries, groupFor(perm.Actor{ID: me.ID, Role: people[me.ID]}, g), http.StatusCreated, nil
	})
}

func (s *Server) renameGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len(in.Name) > 80 {
		writeErr(w, http.StatusBadRequest, "a group needs a name of up to 80 characters")
		return
	}
	g, a := groupFrom(r.Context())
	if !perm.Rename(a, perm.Group{Kind: g.Kind}) {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	g.Name = in.Name
	s.logged(w, r, "group", db.Now(), func(qtx *store.Queries) (any, int, error) {
		err := qtx.RenameGroup(r.Context(), store.RenameGroupParams{Name: in.Name, ID: g.ID})
		return &g, http.StatusOK, err
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
		out = append(out, Membership{GroupID: g.ID, User: User{ID: row.ID, Username: row.Username, Picture: pictureURL(row.PictureID)}, Role: row.Role, JoinedAt: row.JoinedAt})
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
	if !perm.AddMembers(a) || g.Kind == perm.KindRoot {
		writeErr(w, http.StatusForbidden, "not allowed")
		return
	}
	now := db.Now()
	s.logged(w, r, "membership", now, func(qtx *store.Queries) (any, int, error) {
		row, err := qtx.GetUser(r.Context(), in.UserID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such person")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: g.ID, UserID: in.UserID, Role: perm.Member, JoinedAt: now}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, http.StatusConflict, errors.New("already a member")
			}
			return nil, http.StatusInternalServerError, err
		}
		u := User{ID: row.ID, Username: row.Username, Picture: pictureURL(row.PictureID)}
		return Membership{GroupID: g.ID, User: u, Role: perm.Member, JoinedAt: now}, http.StatusCreated, nil
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
	if in.Role != perm.Member && in.Role != perm.Moderator {
		writeErr(w, http.StatusBadRequest, "role must be member or moderator")
		return
	}
	g, a := groupFrom(r.Context())
	uid := r.PathValue("uid")
	s.logged(w, r, "membership", db.Now(), func(qtx *store.Queries) (any, int, error) {
		row, err := qtx.GetUser(r.Context(), uid)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("no such person")
		}
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		target, err := actorIn(r.Context(), qtx, User{ID: uid}, g.ID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(target) {
			return nil, http.StatusNotFound, errors.New("not a member")
		}
		if !perm.SetRole(a, target, in.Role) {
			return nil, http.StatusForbidden, errors.New("not allowed")
		}
		if err := qtx.SetMembershipRole(r.Context(), store.SetMembershipRoleParams{Role: in.Role, GroupID: g.ID, UserID: uid}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		u := User{ID: row.ID, Username: row.Username, Picture: pictureURL(row.PictureID)}
		return Membership{GroupID: g.ID, User: u, Role: in.Role, JoinedAt: 0}, http.StatusOK, nil
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
		if _, err := qtx.DeleteMembership(r.Context(), store.DeleteMembershipParams{GroupID: g.ID, UserID: uid}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		gone := map[string]string{"group_id": g.ID, "user_id": uid}
		return []events.Entry{{Kind: "membership_delete", Payload: gone}}, nil, http.StatusNoContent, nil
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
		roles[row.ID] = row.Role
	}
	s.Hub.Serve(w, r, func(e events.Event) (events.Event, bool) {
		return filterEvent(viewer, roles, e)
	})
}

// filterEvent decides whether one viewer gets one event, and personalises it.
func filterEvent(viewer User, roles map[string]string, e events.Event) (events.Event, bool) {
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
		return encode(forViewer(a, &p))
	case "comment":
		var c Comment
		if json.Unmarshal(e.Payload, &c) != nil {
			return e, false
		}
		a, ok := inGroup(c.GroupID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &c))
	case "message":
		var m Message
		if json.Unmarshal(e.Payload, &m) != nil {
			return e, false
		}
		a, ok := inGroup(m.GroupID)
		if !ok {
			return e, false
		}
		return encode(forViewer(a, &m))
	case "group":
		var g Group
		if json.Unmarshal(e.Payload, &g) != nil {
			return e, false
		}
		a, ok := inGroup(g.ID)
		if !ok {
			return e, false
		}
		return encode(groupFor(a, g))
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
			roles[m.GroupID] = m.Role
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
	default:
		// user, and anything instance-wide: everyone on the instance sees it.
		return e, true
	}
}
