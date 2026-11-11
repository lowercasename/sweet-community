package api

import (
	"testing"
	"time"
)

func TestStreamReadsMembershipBeforeEachEvent(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	member, uid := registerMember(t, ts, owner, "kit")
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private"})["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+room+"/members", map[string]string{"user_id": uid})
	stream := member.liveStream()
	// Change the database without delivering an event, as when a subscriber misses a removal.
	if _, err := srv.DB.Exec("DELETE FROM memberships WHERE group_id=? AND user_id=?", room, uid); err != nil {
		t.Fatal(err)
	}
	owner.mustStatus(201, "POST", "/api/groups/"+room+"/messages", map[string]string{"body_html": "<p>private</p>"})
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>public</p>"})
	timeout := time.After(3 * time.Second)
	for {
		select {
		case kind, ok := <-stream:
			if !ok {
				t.Fatal("stream ended before the public event")
			}
			if kind == "message" {
				t.Fatal("removed member received a private message")
			}
			if kind == "post" {
				return
			}
		case <-timeout:
			t.Fatal("public event did not arrive")
		}
	}
}

func TestStreamReadsStaffRoleBeforeEachEvent(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	moderator, uid := registerMember(t, ts, owner, "kit")
	reporter, _ := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", rootPath+"/members/"+uid, map[string]string{"role": "moderator"})
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>reported</p>"})
	stream := moderator.liveStream()
	if _, err := srv.DB.Exec("UPDATE memberships SET role='member' WHERE user_id=?", uid); err != nil {
		t.Fatal(err)
	}
	reporter.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": post["id"].(string), "reason": "test"})
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>public</p>"})
	timeout := time.After(3 * time.Second)
	for {
		select {
		case kind, ok := <-stream:
			if !ok {
				t.Fatal("stream ended before the public event")
			}
			if kind == "report" {
				t.Fatal("demoted moderator received a report")
			}
			if kind == "post" {
				return
			}
		case <-timeout:
			t.Fatal("public event did not arrive")
		}
	}
}
