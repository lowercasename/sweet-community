package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Group is the wire shape of a group as one viewer sees it. It includes the
// viewer's role in the group and the actions they may perform on it
// (architecture.md, Groups).
type Group struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Name string `json:"name"`
	// Mode is the group's only setting. It is posts, chat or both. A DM is always chat.
	Mode      string `json:"mode"`
	CreatedAt int64  `json:"created_at"`
	// Picture is the URL of the room's picture, or null when the tile with the room's initial is shown.
	Picture *string `json:"picture"`
	// LastMessageAt is the time of the group's newest live message, or null.
	// It is computed when the response is built and never stored. The
	// Messages page uses it to order DMs by latest activity (architecture.md,
	// Layout).
	LastMessageAt *int64   `json:"last_message_at"`
	Role          string   `json:"role,omitempty"`
	Can           GroupCan `json:"can"`
	// Members is set for a DM only. A DM is named after its members, whether
	// or not they have hidden it.
	Members []User `json:"members,omitempty"`
	// HiddenAt is set while the viewer has hidden this conversation. The
	// conversation is then listed for them under Hidden and nowhere else.
	HiddenAt *int64 `json:"hidden_at,omitempty"`
}

// GroupCan holds the actions the viewer may perform on a group. CreateGroups
// is meaningful on the root group only. It reflects the instance's
// group_creation setting.
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
	// ManageInstance is meaningful on the root group only. The owner may edit instance settings.
	ManageInstance bool `json:"manage_instance,omitempty"`
	// ManageTopics is meaningful on the root group only. The owner and moderators may manage the topics.
	ManageTopics bool `json:"manage_topics,omitempty"`
	// ManageRules is meaningful on the root group only. The owner and moderators may write the rules.
	ManageRules bool `json:"manage_rules,omitempty"`
	// HandleReports is meaningful on the root group only. The owner and moderators read and close reports.
	HandleReports bool `json:"handle_reports,omitempty"`
}

// Settings is the wire shape of the instance's settings (architecture.md,
// Feature flags, Admin tools). The owner sets them. Everyone can read them,
// signed in or not, because the sign-in and join pages show the community's
// name. OwnerSet is state rather than a setting. It is false until the setup
// link has been used.
type Settings struct {
	GroupCreation string `json:"group_creation"`
	// Name is the community's name. It is empty until the owner sets it during onboarding.
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerSet    bool   `json:"owner_set"`
}

const (
	maxNameLen        = 60
	maxDescriptionLen = 500
)

func (s *Server) settings(ctx context.Context) (Settings, error) {
	return settingsOf(ctx, s.q())
}

func settingsOf(ctx context.Context, q *store.Queries) (Settings, error) {
	get := func(key, fallback string) (string, error) {
		v, err := q.GetSetting(ctx, key)
		if errors.Is(err, sql.ErrNoRows) {
			return fallback, nil
		}
		return v, err
	}
	var st Settings
	var err error
	if st.GroupCreation, err = get("group_creation", perm.CreationAnyone); err != nil {
		return st, err
	}
	if st.Name, err = get("name", ""); err != nil {
		return st, err
	}
	if st.Description, err = get("description", ""); err != nil {
		return st, err
	}
	ownerID, err := q.GetGroupOwnerID(ctx, perm.Root)
	if err == nil {
		row, err := q.GetUser(ctx, ownerID)
		if err != nil {
			return st, err
		}
		hash, err := q.GetUserPasswordHash(ctx, row.Username)
		if err != nil {
			return st, err
		}
		st.OwnerSet = hash.PasswordHash.Valid
	} else if !errors.Is(err, sql.ErrNoRows) {
		return st, err
	}
	return st, nil
}

// Membership is one user's membership of a group.
type Membership struct {
	GroupID  string `json:"group_id"`
	User     User   `json:"user"`
	Role     string `json:"role"`
	JoinedAt int64  `json:"joined_at"`
	// HiddenAt is set while this user has hidden a conversation. It is sent to that user only.
	HiddenAt *int64 `json:"hidden_at"`
}

func groupFor(a perm.Actor, g Group, st Settings) Group {
	pg := perm.Group{Kind: g.Kind}
	g.Role = a.Role
	g.Can = GroupCan{
		// In the root group, members are added by invite link and nobody is removed (member removal comes with admin tools). Nobody is added to a conversation.
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
		g.Can.ManageTopics = perm.ManageTopics(a)
		g.Can.ManageRules = perm.ManageRules(a)
		g.Can.HandleReports = perm.HandleReports(a)
	}
	return g
}

// actorIn returns the user's Actor in one group, with their role there or no
// role. Not being a member is a valid result, not an error.
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

// requireGroup is requireAuth plus a membership check for the group in the
// path. A non-member gets 404, never 403, so that the group's existence is
// not revealed. The group and the actor are put in the context.
func (s *Server) requireGroup(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		me, _ := userFrom(r.Context())
		id := r.PathValue("gid")
		row, err := s.q().GetGroup(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			writeErr(w, http.StatusNotFound, "No such room")
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
			writeErr(w, http.StatusNotFound, "No such room")
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
		// The list row is the group row plus the viewer's role. TestRepliesAndEventsMatchTheRow checks that list and fetch produce the same shape.
		g, err := wireGroup(r.Context(), s.q(), store.GetGroupRow{ID: row.ID, Kind: row.Kind, Name: row.Name, Mode: row.Mode, CreatedAt: row.CreatedAt, PictureID: row.PictureID, LastMessageAt: row.LastMessageAt})
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		g.HiddenAt = nullInt(row.HiddenAt)
		out = append(out, groupFor(perm.Actor{ID: me.ID, Role: row.Role}, g, st))
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": out})
}

func (s *Server) getGroup(w http.ResponseWriter, r *http.Request) {
	g, _ := groupFrom(r.Context())
	writeJSON(w, http.StatusOK, g)
}

// createGroup creates a named group with the caller as owner, or a DM, which
// is an unnamed group of the caller and the given users with equal roles.
// When a DM with exactly those users already exists, it is returned with 200
// instead of 201.
func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind    string   `json:"kind"`
		Name    string   `json:"name"`
		Mode    string   `json:"mode"`
		Members []string `json:"members"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
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
		writeErr(w, http.StatusForbidden, "Not allowed")
		return
	}
	now := db.Now()
	switch in.Kind {
	case "", perm.KindGroup:
		in.Name = strings.TrimSpace(in.Name)
		if in.Name == "" || len(in.Name) > 80 {
			writeErr(w, http.StatusBadRequest, "A room needs a name of up to 80 characters")
			return
		}
		if in.Mode == "" {
			in.Mode = perm.ModeBoth
		}
		if !validMode(in.Mode) {
			writeErr(w, http.StatusBadRequest, "Mode must be posts, chat or both")
			return
		}
		s.createGroupWith(w, r, perm.KindGroup, in.Name, in.Mode, now, map[string]string{me.ID: perm.Owner})
	case perm.KindDM:
		people := map[string]bool{me.ID: true}
		for _, id := range in.Members {
			people[id] = true
		}
		// A conversation has two members (architecture.md, Groups). A group with more is a room.
		if len(people) != 2 {
			writeErr(w, http.StatusBadRequest, "A conversation is between two people. For more people, make a room.")
			return
		}
		ids := make([]string, 0, len(people))
		for id := range people {
			ids = append(ids, id)
		}
		s.openConversation(w, r, me, ids, now)
	default:
		writeErr(w, http.StatusBadRequest, "Kind must be group or dm")
	}
}

// openConversation returns the conversation of exactly these two users
// (architecture.md, Groups). There is one per pair, keyed by the sorted ids.
// It is found or created inside one transaction, so two concurrent requests
// cannot create two. The viewer is one of the two. If the viewer had hidden
// the conversation, it is unhidden, which produces a membership event. The
// response is the group, with 200 when found or 201 when created.
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
			if m.HiddenAt.Valid {
				if err := qtx.ShowMembership(ctx, store.ShowMembershipParams{GroupID: g.ID, UserID: me.ID}); err != nil {
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
			if u, err := qtx.GetUser(ctx, uid); errors.Is(err, sql.ErrNoRows) || (err == nil && u.RemovedAt.Valid) {
				return nil, nil, http.StatusBadRequest, errors.New("No such person: " + uid)
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

// createGroupWith creates a group and its memberships. The response and the
// events are read back from the rows after the writes. loggedMany
// personalises the response for the creator's role in the new group.
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
				return nil, nil, http.StatusBadRequest, errors.New("No such person: " + uid)
			} else if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: gid, UserID: uid, Role: role, JoinedAt: now}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
		}
		// Read back the written rows. The response and the events are built from them.
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

// setGroupPicture sets a room's picture to an uploaded image, or resets it to
// the room's initial with a null image_id. Only the owner may, as with
// renaming (perm.Rename). A conversation has no picture of its own. It shows
// the other member's picture.
func (s *Server) setGroupPicture(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ImageID *string `json:"image_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	g, a := groupFrom(r.Context())
	if !perm.Rename(a, perm.Group{Kind: g.Kind}) {
		writeErr(w, http.StatusForbidden, "Not allowed")
		return
	}
	s.logged(w, r, "group", db.Now(), func(qtx *store.Queries) (any, int, error) {
		var pic sql.NullString
		if in.ImageID != nil {
			if _, err := qtx.GetImage(r.Context(), *in.ImageID); errors.Is(err, sql.ErrNoRows) {
				return nil, http.StatusNotFound, errors.New("No such image")
			} else if err != nil {
				return nil, http.StatusInternalServerError, err
			}
			pic = sql.NullString{String: *in.ImageID, Valid: true}
		}
		if err := qtx.SetGroupPicture(r.Context(), store.SetGroupPictureParams{PictureID: pic, ID: g.ID}); err != nil {
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

// updateGroup sets a group's name and mode (perm.Rename, perm.SetMode).
func (s *Server) updateGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name *string `json:"name"`
		Mode *string `json:"mode"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	g, a := groupFrom(r.Context())
	pg := perm.Group{Kind: g.Kind}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" || len(name) > 80 {
			writeErr(w, http.StatusBadRequest, "A room needs a name of up to 80 characters")
			return
		}
		if !perm.Rename(a, pg) {
			writeErr(w, http.StatusForbidden, "Not allowed")
			return
		}
		g.Name = name
	}
	if in.Mode != nil {
		if !validMode(*in.Mode) {
			writeErr(w, http.StatusBadRequest, "Mode must be posts, chat or both")
			return
		}
		if g.Kind == perm.KindDM {
			writeErr(w, http.StatusBadRequest, "A conversation is chat only")
			return
		}
		if !perm.SetMode(a, pg) {
			writeErr(w, http.StatusForbidden, "Not allowed")
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
		writeErr(w, http.StatusForbidden, "Not allowed")
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
	viewer, _ := userFrom(r.Context())
	out := make([]Membership, 0, len(rows))
	for _, row := range rows {
		m := wireMembership(g.ID, store.GetMemberRow(row))
		// Whether a user has hidden a conversation is sent to that user only.
		if m.User.ID != viewer.ID {
			m.HiddenAt = nil
		}
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": out})
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserID string `json:"user_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	g, a := groupFrom(r.Context())
	if !perm.AddMembers(a, perm.Group{Kind: g.Kind}) || g.Kind == perm.KindRoot {
		writeErr(w, http.StatusForbidden, "Not allowed")
		return
	}
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		if u, err := qtx.GetUser(r.Context(), in.UserID); errors.Is(err, sql.ErrNoRows) || (err == nil && u.RemovedAt.Valid) {
			return nil, nil, http.StatusNotFound, errors.New("No such person")
		} else if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if err := qtx.CreateMembership(r.Context(), store.CreateMembershipParams{GroupID: g.ID, UserID: in.UserID, Role: perm.Member, JoinedAt: now}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, nil, http.StatusConflict, errors.New("Already a member")
			}
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: in.UserID})
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		m := wireMembership(g.ID, row)
		entries := []events.Entry{{Kind: "membership", Payload: m}}
		// The room's chat says who added whom (architecture.md, Chat).
		line, err := chatLine(r.Context(), qtx, g.ID, AddedKind, a.ID, in.UserID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entries = append(entries, line)
		// The added user is notified (architecture.md, Notifications). The membership event alone does not produce a notification.
		if told, err := notify(r, qtx, NotifyAdded, in.UserID, a.ID, g.ID, nil, now); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		} else if told != nil {
			entries = append(entries, *told)
		}
		return entries, m, http.StatusCreated, nil
	})
}

// setMemberRole lets the group's owner set a member's role to member or
// moderator, or transfer ownership.
func (s *Server) setMemberRole(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role string `json:"role"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	if in.Role != perm.Member && in.Role != perm.Moderator && in.Role != perm.Owner {
		writeErr(w, http.StatusBadRequest, "Role must be member, moderator or owner")
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
			return nil, nil, http.StatusNotFound, errors.New("Not a member")
		}
		// member reads a membership back after its role was written. It is the same row with the new role and the original joined time.
		member := func(userID string) (Membership, error) {
			row, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: userID})
			return wireMembership(g.ID, row), err
		}
		if in.Role == perm.Owner {
			// Ownership transfer. The target becomes owner and the current owner becomes a moderator. Two memberships change.
			if !perm.Transfer(a, target) {
				return nil, nil, http.StatusForbidden, errors.New("Not allowed")
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
			return nil, nil, http.StatusForbidden, errors.New("Not allowed")
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

// removeMember lets staff remove any member except the owner, and lets any
// member remove themselves, which is leaving. Neither applies to the root
// group.
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
			return nil, nil, http.StatusNotFound, errors.New("Not a member")
		}
		pg := perm.Group{Kind: g.Kind}
		allowed := false
		if uid == me.ID {
			allowed = perm.Leave(a, pg)
		} else {
			allowed = perm.RemoveMembers(a) && target.Role != perm.Owner && g.Kind != perm.KindRoot
		}
		if !allowed {
			return nil, nil, http.StatusForbidden, errors.New("Not allowed")
		}
		if g.Kind == perm.KindDM {
			// Leaving a conversation hides it. The membership row remains, hidden_at
			// is set, and opening the conversation again unhides it (architecture.md,
			// Groups).
			if err := qtx.HideMembership(r.Context(), store.HideMembershipParams{HiddenAt: sql.NullInt64{Int64: db.Now(), Valid: true}, GroupID: g.ID, UserID: uid}); err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			m, err := qtx.GetMember(r.Context(), store.GetMemberParams{GroupID: g.ID, UserID: uid})
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			// The response is the membership too, so the user's own page lists the conversation under Hidden immediately.
			mm := wireMembership(g.ID, m)
			return []events.Entry{{Kind: "membership", Payload: mm}}, mm, http.StatusOK, nil
		}
		if _, err := qtx.DeleteMembership(r.Context(), store.DeleteMembershipParams{GroupID: g.ID, UserID: uid}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		gone := map[string]string{"group_id": g.ID, "user_id": uid}
		entries := []events.Entry{{Kind: "membership_delete", Payload: gone}}
		// A group whose last member leaves is deleted.
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
// viewer (architecture.md, Realtime). The connection tracks the viewer's
// role in each group and updates it from the viewer's own membership events,
// so an event for a group they are not in is never written.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	viewer, _ := userFrom(r.Context())
	rows, err := s.q().ListMyGroups(r.Context(), viewer.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	roles := map[string]string{}
	for _, row := range rows {
		if !row.HiddenAt.Valid {
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

// getSettings and setSettings read and write the instance's settings. Only
// the root group's owner may write them.
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
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	if in.GroupCreation != perm.CreationAnyone && in.GroupCreation != perm.CreationStaff {
		writeErr(w, http.StatusBadRequest, "Who can create rooms must be anyone or staff")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	if in.Name == "" {
		writeErr(w, http.StatusBadRequest, "The community needs a name")
		return
	}
	if utf8.RuneCountInString(in.Name) > maxNameLen {
		writeErr(w, http.StatusBadRequest, "The name is too long")
		return
	}
	if utf8.RuneCountInString(in.Description) > maxDescriptionLen {
		writeErr(w, http.StatusBadRequest, "The description is too long")
		return
	}
	s.logged(w, r, "settings", db.Now(), func(qtx *store.Queries) (any, int, error) {
		for key, value := range map[string]string{"group_creation": in.GroupCreation, "name": in.Name, "description": in.Description} {
			if err := qtx.SetSetting(r.Context(), store.SetSettingParams{Key: key, Value: value}); err != nil {
				return nil, http.StatusInternalServerError, err
			}
		}
		// Read the settings back from the rows. The event payload is built from them.
		st, err := settingsOf(r.Context(), qtx)
		return st, http.StatusOK, err
	})
}

// filterEvent decides whether one viewer receives one event, and personalises it.
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
	case "post_delete", "comment_delete", "message_delete":
		// Sent to the group's members only, so the event does not show activity in a group the viewer is not in.
		var d struct {
			GroupID string `json:"group_id"`
		}
		if json.Unmarshal(e.Payload, &d) != nil {
			return e, false
		}
		_, ok := roles[d.GroupID]
		return e, ok
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
			// The viewer's own membership, either joined or hidden. The viewer
			// receives it in both cases.
			if m.HiddenAt != nil {
				delete(roles, m.GroupID)
			} else {
				roles[m.GroupID] = m.Role
			}
			return e, true
		}
		// Another user hiding a conversation is sent to that user only.
		if m.HiddenAt != nil {
			return e, false
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
	case "report", "report_delete":
		// Sent to the root group's owner and moderators only (architecture.md, Admin tools). A report is personalised
		// with the viewer's role in the reported item's group, which decides whether they can open it.
		if !perm.HandleReports(perm.Actor{ID: viewer.ID, Role: roles[perm.Root]}) {
			return e, false
		}
		if e.Kind == "report_delete" {
			return e, true
		}
		var rp Report
		if json.Unmarshal(e.Payload, &rp) != nil {
			return e, false
		}
		a, _ := inGroup(rp.GroupID)
		return encode(forViewer(a, &rp, *st))
	case "notification", "notification_delete", "marker":
		// Sent to the owning user only. A notification belongs to its recipient, and a marker records how far its user has read.
		var own struct {
			UserID string `json:"user_id"`
		}
		return e, json.Unmarshal(e.Payload, &own) == nil && own.UserID == viewer.ID
	default:
		// A user event, or any other instance-wide event, is sent to every user on the instance.
		return e, true
	}
}
