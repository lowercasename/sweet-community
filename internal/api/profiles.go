package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// Profile is a person as their page shows them (architecture.md, Accounts):
// who they are, their standing here, when they joined, and their bio, which
// is a body like any other, sanitised by the same policy. Everyone on the
// instance may see every profile; only its person edits the bio.
type Profile struct {
	User
	Role     string `json:"role"`
	JoinedAt int64  `json:"joined_at"`
	BioHTML  string `json:"bio_html"`
	Can      struct {
		Edit bool `json:"edit"`
	} `json:"can"`
}

// profileFor fills in what the viewer may do.
func profileFor(viewer User, p Profile) Profile {
	p.Can.Edit = viewer.ID == p.ID
	return p
}

// getProfile is a person by name; a removed account, or no account, is 404.
func (s *Server) getProfile(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	row, err := s.q().GetProfileByUsername(r.Context(), r.PathValue("name"))
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "no such person")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, profileFor(me, wireProfile(row)))
}

// setBio sets the signed-in person's bio: sanitised like a body, and it may
// be empty. The event carries the whole profile, so every open page redraws it.
func (s *Server) setBio(w http.ResponseWriter, r *http.Request) {
	var in struct {
		BodyHTML string `json:"body_html"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, sanitize.MaxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	clean := sanitize.Body(in.BodyHTML)
	if sanitize.IsEmpty(clean) {
		clean = ""
	}
	me, _ := userFrom(r.Context())
	s.logged(w, r, "profile", db.Now(), func(qtx *store.Queries) (any, int, error) {
		if err := qtx.SetUserBio(r.Context(), store.SetUserBioParams{BioHtml: clean, BioText: sanitize.Text(clean), ID: me.ID}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetProfile(r.Context(), me.ID)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		p := wireProfile(store.GetProfileByUsernameRow(row))
		return &p, http.StatusOK, nil
	})
}

// listUserPosts is one person's posts, newest first, only from the groups
// the viewer is in, each with the viewer's own flags for its group.
func (s *Server) listUserPosts(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	who, err := s.q().GetProfileByUsername(r.Context(), r.PathValue("name"))
	if errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "no such person")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	before, limit := pageParams(r, 20, 100)
	rows, err := s.q().ListPostsByAuthor(r.Context(), store.ListPostsByAuthorParams{ViewerID: me.ID, AuthorID: who.ID, Before: before, PageSize: int64(limit + 1)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	mine, err := s.q().ListMyGroups(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	roles := map[string]string{}
	for _, g := range mine {
		if !g.HiddenAt.Valid {
			roles[g.ID] = g.Role
		}
	}
	posts := make([]Post, 0, len(rows))
	for _, row := range rows {
		p := wirePost(store.GetPostRow(row))
		posts = append(posts, *forViewer(perm.Actor{ID: me.ID, Role: roles[p.GroupID]}, &p, Settings{}).(*Post))
	}
	var next *int64
	if len(posts) > limit {
		posts = posts[:limit]
		n := posts[len(posts)-1].CreatedAt
		next = &n
	}
	writeJSON(w, http.StatusOK, map[string]any{"posts": posts, "next_before": next})
}
