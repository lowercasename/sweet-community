package api

import (
	"testing"
	"time"

	"sweet/internal/perm"
)

func TestOpenRoomsShareAccessButKeepChatSeparate(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Conference", "visibility": "open"})
	gid := g["id"].(string)
	gp := "/api/groups/" + gid
	if g["visibility"] != "open" {
		t.Fatalf("visibility: %v", g["visibility"])
	}
	for _, c := range []*client{owner, kit, mo} {
		if myGroups(c)[gid] == nil {
			t.Fatal("open room absent from navigation")
		}
		c.mustStatus(200, "GET", gp, nil)
	}
	later, _ := registerMember(t, ts, owner, "later")
	later.mustStatus(200, "GET", gp, nil)
	p := mo.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>conference plans</p>"})
	mo.mustStatus(201, "POST", gp+"/messages", map[string]string{"body_html": "<p>room chat</p>"})
	home := owner.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if len(home) != 1 || home[0].(map[string]any)["id"] != p["id"] {
		t.Fatal("Home does not include the open room post")
	}
	if home[0].(map[string]any)["can"].(map[string]any)["delete"] == true {
		t.Fatal("community owner gained room moderation rights")
	}
	kitHome := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if !kitHome[0].(map[string]any)["can"].(map[string]any)["delete"].(bool) {
		t.Fatal("room owner lost room moderation rights on Home")
	}
	for _, item := range owner.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if item.(map[string]any)["body_html"] == "<p>room chat</p>" {
			t.Fatal("room chat leaked into community chat")
		}
	}
	kit.mustStatus(403, "DELETE", gp+"/members/"+kitID, nil)
	owner.mustStatus(403, "DELETE", "/api/posts/"+p["id"].(string), nil)
	kit.mustStatus(200, "DELETE", "/api/posts/"+p["id"].(string), nil)
	// Open-room creation and content are available through replay for all community members.
	found := false
	for _, e := range later.readEvents(100) {
		if e["kind"] == "group" && e["payload"].(map[string]any)["id"] == gid {
			found = true
		}
	}
	if !found {
		t.Fatal("open room missing from event replay")
	}
}

func TestHomeExcludesPrivatePostsForMembersToo(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	g := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private", "visibility": "private"})
	gp := "/api/groups/" + g["id"].(string)
	owner.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": kitID})
	owner.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>private</p>"})
	for _, c := range []*client{owner, kit} {
		if len(c.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)) != 0 {
			t.Fatal("private post appeared on Home")
		}
	}
	if g["visibility"] != "private" {
		t.Fatal("private visibility not stated")
	}
	owner.mustStatus(400, "POST", "/api/groups", map[string]string{"name": "Invalid", "visibility": "listed"})
	owner.mustStatus(400, "PUT", gp, map[string]string{"visibility": "open"})
}

func TestOpenRoomReadPositionsApplyOnHomeAndInRoom(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	g := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Open", "visibility": "open"})
	gid := g["id"].(string)
	unread := func(stream string) float64 {
		for _, raw := range kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
			m := raw.(map[string]any)
			if m["stream"] == stream {
				return m["unread"].(float64)
			}
		}
		t.Fatal("missing marker")
		return -1
	}
	for _, first := range []string{"feed:" + perm.Root, "feed:" + gid} {
		time.Sleep(2 * time.Millisecond)
		p := owner.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>new discussion</p>"})
		if unread("feed:"+perm.Root) != 1 || unread("feed:"+gid) != 1 {
			t.Fatal("new post must be unread on both views")
		}
		kit.mustStatus(200, "PUT", "/api/markers/"+first, map[string]any{"read_at": p["created_at"]})
		if unread("feed:"+perm.Root) != 0 || unread("feed:"+gid) != 0 {
			t.Fatal("read post still unread in another view")
		}
	}
}
