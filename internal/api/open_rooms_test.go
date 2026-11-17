package api

import (
	"context"
	"os"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/perm"
)

func TestLegacyRoomMigrationSharesPostsAndRoomChat(t *testing.T) {
	ts, owner, server := newTestServerWith(t)
	mo, moID := registerMember(t, ts, owner, "mo")
	legacy := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Conference", "visibility": "private"})["id"].(string)
	private := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private plans", "visibility": "private"})["id"].(string)
	p := owner.mustStatus(201, "POST", "/api/groups/"+legacy+"/posts", map[string]string{"body_html": "<p>Conference post</p>"})
	owner.mustStatus(201, "POST", "/api/groups/"+legacy+"/messages", map[string]string{"body_html": "<p>Conference chat</p>"})
	owner.mustStatus(201, "POST", "/api/groups/"+private+"/posts", map[string]string{"body_html": "<p>Private post</p>"})
	mo.mustStatus(404, "GET", "/api/groups/"+legacy, nil)
	// Reproduce the database state immediately before the corrective migration.
	cutoff := db.Now()
	for _, query := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM schema_migrations WHERE name='022_open_existing_rooms.sql'`, nil},
		{`UPDATE schema_migrations SET applied_at=? WHERE name='018_open_rooms.sql'`, []any{cutoff}},
		{`UPDATE groups SET created_at=? WHERE id=?`, []any{cutoff - 1, legacy}},
		{`UPDATE groups SET created_at=? WHERE id=?`, []any{cutoff + 1, private}},
	} {
		if _, err := server.DB.Exec(query.sql, query.args...); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrate(context.Background(), server.DB, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	var role string
	var saved int
	if err := server.DB.QueryRow(`SELECT role,in_sidebar FROM memberships WHERE group_id=? AND user_id=?`, legacy, moID).Scan(&role, &saved); err != nil || role != "member" || saved != 0 {
		t.Fatalf("new access changed role or sidebar: %q %d %v", role, saved, err)
	}
	if group := mo.mustStatus(200, "GET", "/api/groups/"+legacy, nil); group["visibility"] != "open" {
		t.Fatalf("legacy room visibility: %v", group["visibility"])
	}
	posts := mo.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if len(posts) != 1 || posts[0].(map[string]any)["id"] != p["id"] || posts[0].(map[string]any)["group_visibility"] != "open" {
		t.Fatal("Home does not show only the migrated room's post as open")
	}
	mo.mustStatus(200, "GET", "/api/groups/"+legacy+"/messages", nil)
	mo.mustStatus(201, "POST", "/api/groups/"+legacy+"/messages", map[string]string{"body_html": "<p>Joining the discussion</p>"})
	mo.mustStatus(404, "GET", "/api/groups/"+private, nil)
	mo.mustStatus(404, "GET", "/api/groups/"+private+"/messages", nil)
	mo.mustStatus(403, "DELETE", "/api/posts/"+p["id"].(string), nil)
}

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

func TestPrivateRoomCreationIncludesSelectedMembers(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	g := owner.mustStatus(201, "POST", "/api/groups", map[string]any{
		"name": "Private plans", "visibility": "private", "members": []string{kitID, kitID, ownerID},
	})
	gid := g["id"].(string)
	kit.mustStatus(200, "GET", "/api/groups/"+gid, nil)
	mo.mustStatus(404, "GET", "/api/groups/"+gid, nil)
	if len(owner.mustStatus(200, "GET", "/api/groups/"+gid+"/members", nil)["members"].([]any)) != 2 {
		t.Fatal("selected members were not deduplicated")
	}
	if myGroups(owner)[gid]["role"] != "owner" {
		t.Fatal("selecting the creator changed ownership")
	}
	found := false
	for _, raw := range kit.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
		n := raw.(map[string]any)
		if n["kind"] == "added" && n["group_id"] == gid {
			found = true
		}
	}
	if !found {
		t.Fatal("selected member was not notified")
	}
	before := len(myGroups(owner))
	owner.mustStatus(400, "POST", "/api/groups", map[string]any{
		"name": "Invalid", "visibility": "private", "members": []string{kitID, "missing"},
	})
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)
	owner.mustStatus(400, "POST", "/api/groups", map[string]any{
		"name": "Removed", "visibility": "private", "members": []string{moID},
	})
	if len(myGroups(owner)) != before {
		t.Fatal("invalid selection left a partial room")
	}
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
