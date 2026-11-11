package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"sweet/internal/events"
	"sweet/internal/perm"
)

// events checks the session and current permissions throughout live delivery and replay.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	viewer, _ := userFrom(r.Context())
	ctx, end := context.WithCancel(r.Context())
	defer end()
	leave := s.Hub.Join(viewer.ID, end)
	defer leave()
	sid := sessionFrom(r.Context())
	allowed := func() (bool, error) {
		_, err := s.sessionUser(ctx, sid)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return err == nil, err
	}
	s.Hub.Serve(w, r.WithContext(ctx), func(e events.Event) (events.Event, bool, error) {
		rows, err := s.q().ListEventRoles(ctx, viewer.ID)
		if err != nil {
			return e, false, err
		}
		roles := make(map[string]string, len(rows))
		for _, row := range rows {
			roles[row.GroupID] = row.Role
		}
		st, err := s.settings(ctx)
		if err != nil {
			return e, false, err
		}
		out, visible := filterEvent(viewer, roles, &st, e)
		return out, visible, nil
	}, allowed)
}

// filterEvent decides whether one viewer receives one event, and personalises it.
func filterEvent(viewer User, roles map[string]string, st *Settings, e events.Event) (events.Event, bool) {
	inGroup := func(gid string) (perm.Actor, bool) {
		a := perm.Actor{ID: viewer.ID, Role: roles[gid]}
		return a, perm.CanSee(a)
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
		return e, true
	case "membership":
		var m Membership
		if json.Unmarshal(e.Payload, &m) != nil {
			return e, false
		}
		if m.User.ID == viewer.ID {
			// The viewer's own membership, either joined or hidden. The viewer
			// receives it in both cases.
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
			return e, true
		}
		_, ok := roles[d.GroupID]
		return e, ok
	case "report", "report_delete":
		// Sent to the root group's owner and moderators only. A report is personalised
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
	case "user", "profile", "settings", "rules", "welcome", "topic", "topic_delete":
		return e, true
	default:
		return e, false
	}
}
