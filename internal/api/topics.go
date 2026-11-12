package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Topic is a label a post on the community's feed can carry, at most one per
// post. The root group's staff manage the list. Any
// user may follow a topic to be notified of posts in it. The counts are for
// the owner's list. Following is the viewer's own state and is filled in
// when the response is built.
type Topic struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	CreatedAt     int64  `json:"created_at"`
	PostCount     int64  `json:"post_count"`
	FollowerCount int64  `json:"follower_count"`
	Following     bool   `json:"following"`
}

const (
	maxTopicNameLen        = 40
	maxTopicDescriptionLen = 140
)

func wireTopic(row store.GetTopicRow) Topic {
	return Topic{ID: row.ID, Name: row.Name, Description: row.Description, CreatedAt: row.CreatedAt, PostCount: row.PostCount, FollowerCount: row.FollowerCount}
}

// topicInput reads a topic's name and description, trims them, and checks their lengths.
func topicInput(w http.ResponseWriter, r *http.Request) (name, description string, ok bool) {
	var in struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return "", "", false
	}
	name = strings.TrimSpace(in.Name)
	description = strings.TrimSpace(in.Description)
	switch {
	case name == "":
		writeErr(w, http.StatusBadRequest, "A topic needs a name")
	case utf8.RuneCountInString(name) > maxTopicNameLen:
		writeErr(w, http.StatusBadRequest, "A topic's name is up to 40 characters")
	case utf8.RuneCountInString(description) > maxTopicDescriptionLen:
		writeErr(w, http.StatusBadRequest, "A topic's description is up to 140 characters")
	default:
		return name, description, true
	}
	return "", "", false
}

// listTopics returns the community's topics in alphabetical order, each with whether the user follows it.
func (s *Server) listTopics(w http.ResponseWriter, r *http.Request) {
	me, _ := userFrom(r.Context())
	rows, err := s.q().ListTopics(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	followed, err := s.q().ListMyTopicFollows(r.Context(), me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	mine := map[string]bool{}
	for _, id := range followed {
		mine[id] = true
	}
	topics := make([]Topic, 0, len(rows))
	for _, row := range rows {
		t := wireTopic(store.GetTopicRow(row))
		t.Following = mine[t.ID]
		topics = append(topics, t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"topics": topics})
}

func (s *Server) createTopic(w http.ResponseWriter, r *http.Request) {
	name, description, ok := topicInput(w, r)
	if !ok {
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := db.Now()
	s.logged(w, r, "topic", now, func(qtx *store.Queries) (any, int, error) {
		if err := qtx.CreateTopic(r.Context(), store.CreateTopicParams{ID: id.String(), Name: name, Description: description, CreatedAt: now}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, http.StatusConflict, errors.New("There is already a topic with that name")
			}
			return nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetTopic(r.Context(), id.String())
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		t := wireTopic(row)
		return &t, http.StatusCreated, nil
	})
}

func (s *Server) updateTopic(w http.ResponseWriter, r *http.Request) {
	name, description, ok := topicInput(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	s.logged(w, r, "topic", db.Now(), func(qtx *store.Queries) (any, int, error) {
		if _, err := qtx.GetTopic(r.Context(), id); errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("No such topic")
		} else if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		if err := qtx.UpdateTopic(r.Context(), store.UpdateTopicParams{Name: name, Description: description, ID: id}); err != nil {
			if db.IsUniqueViolation(err) {
				return nil, http.StatusConflict, errors.New("There is already a topic with that name")
			}
			return nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetTopic(r.Context(), id)
		if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		t := wireTopic(row)
		return &t, http.StatusOK, nil
	})
}

// deleteTopic deletes a topic. Its posts remain without a topic, and its
// follows are deleted.
func (s *Server) deleteTopic(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	s.logged(w, r, "topic_delete", db.Now(), func(qtx *store.Queries) (any, int, error) {
		if _, err := qtx.GetTopic(r.Context(), id); errors.Is(err, sql.ErrNoRows) {
			return nil, http.StatusNotFound, errors.New("No such topic")
		} else if err != nil {
			return nil, http.StatusInternalServerError, err
		}
		for _, step := range []func() error{
			func() error { return qtx.ClearPostsTopic(r.Context(), sql.NullString{String: id, Valid: true}) },
			func() error { return qtx.DeleteTopicFollows(r.Context(), id) },
			func() error { return qtx.DeleteTopic(r.Context(), id) },
		} {
			if err := step(); err != nil {
				return nil, http.StatusInternalServerError, err
			}
		}
		return map[string]string{"id": id}, http.StatusOK, nil
	})
}

// followTopic and unfollowTopic change the user's own follow state, so no
// event is logged. The response is the topic as the user now sees it.
func (s *Server) followTopic(w http.ResponseWriter, r *http.Request) { s.setFollow(w, r, true) }

func (s *Server) unfollowTopic(w http.ResponseWriter, r *http.Request) { s.setFollow(w, r, false) }

func (s *Server) setFollow(w http.ResponseWriter, r *http.Request, on bool) {
	me, _ := userFrom(r.Context())
	id := r.PathValue("id")
	q := s.q()
	if _, err := q.GetTopic(r.Context(), id); errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusNotFound, "No such topic")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	var err error
	if on {
		err = q.FollowTopic(r.Context(), store.FollowTopicParams{UserID: me.ID, TopicID: id, CreatedAt: db.Now()})
	} else {
		err = q.UnfollowTopic(r.Context(), store.UnfollowTopicParams{UserID: me.ID, TopicID: id})
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	row, err := q.GetTopic(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	t := wireTopic(row)
	t.Following = on
	writeJSON(w, http.StatusOK, t)
}

// topicExists returns 400 for a topic id that does not exist. It returns nil for a nil topicID.
func topicExists(r *http.Request, q *store.Queries, topicID *string) (int, error) {
	if topicID == nil {
		return 0, nil
	}
	if _, err := q.GetTopic(r.Context(), *topicID); errors.Is(err, sql.ErrNoRows) {
		return http.StatusBadRequest, errors.New("No such topic")
	} else if err != nil {
		return http.StatusInternalServerError, err
	}
	return 0, nil
}

// tellFollowers writes a topic_post notification to each follower of the
// topic except the author, inside the caller's transaction.
func tellFollowers(r *http.Request, qtx *store.Queries, topicID, postID, actor string, now int64, skip ...string) ([]events.Entry, error) {
	followers, err := qtx.ListTopicFollowers(r.Context(), topicID)
	if err != nil {
		return nil, err
	}
	var out []events.Entry
	for _, uid := range followers {
		if slices.Contains(skip, uid) {
			continue
		}
		entry, err := notifyIn(r, qtx, NotifyTopicPost, uid, actor, perm.Root, &postID, &topicID, now)
		if err != nil {
			return nil, err
		}
		if entry != nil {
			out = append(out, *entry)
		}
	}
	return out, nil
}

// setPostTopic is `PUT /api/posts/{id}/topic {topic_id}`. The author may set
// their own post's topic, and the root group's staff may set any post's
// (perm.SetTopic). Only a post on the community's feed has a topic. Moving a
// post into a topic notifies that topic's followers. Setting the topic it
// already has notifies nobody.
func (s *Server) setPostTopic(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TopicID *string `json:"topic_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	me, _ := userFrom(r.Context())
	id := r.PathValue("id")
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		owners, err := qtx.GetPostOwners(r.Context(), id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("No such post")
		}
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(r.Context(), qtx, me, owners.GroupID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, nil, http.StatusNotFound, errors.New("No such post")
		}
		if owners.GroupID != perm.Root {
			return nil, nil, http.StatusBadRequest, errors.New("Only posts on the community's feed have topics")
		}
		if !perm.SetTopic(a, perm.Post{AuthorID: owners.AuthorID}) {
			return nil, nil, http.StatusForbidden, errors.New("Not allowed")
		}
		if status, err := topicExists(r, qtx, in.TopicID); err != nil {
			return nil, nil, status, err
		}
		before, err := qtx.GetPost(r.Context(), id)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		next := sql.NullString{}
		if in.TopicID != nil {
			next = sql.NullString{String: *in.TopicID, Valid: true}
		}
		if err := qtx.SetPostTopic(r.Context(), store.SetPostTopicParams{TopicID: next, ID: id}); err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		row, err := qtx.GetPost(r.Context(), id)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		p := wirePost(row)
		entries := []events.Entry{{Kind: "post", Payload: &p}}
		if next.Valid && next != before.TopicID {
			told, err := tellFollowers(r, qtx, next.String, id, me.ID, now)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = append(entries, told...)
		}
		return entries, &p, http.StatusOK, nil
	})
}
