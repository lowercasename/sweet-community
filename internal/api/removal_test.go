package api

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"sweet/internal/perm"
)

// Removing someone from the instance (architecture.md, Admin tools): staff
// do it from People, anyone to themselves from Settings. Their words stay
// under a removed name, each room they owned passes by seniority or closes,
// their conversations keep their place, their sessions end, and the name
// cannot be registered.
func TestRemoveFromInstance(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, joID := registerMember(t, ts, owner, "jo")
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	rootPath := "/api/groups/" + perm.Root

	// Kit owns a club with mo (its moderator) and jo, is alone in another room, and has a pair with mo.
	club := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Club"})
	cp := "/api/groups/" + club["id"].(string)
	kit.mustStatus(201, "POST", cp+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(201, "POST", cp+"/members", map[string]string{"user_id": joID})
	kit.mustStatus(200, "PUT", cp+"/members/"+moID, map[string]string{"role": "moderator"})
	solo := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Solo"})
	pair := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	pid := pair["id"].(string)
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mine</p>"})

	// Who may: a member nobody; a moderator the members, not another moderator; nobody the owner; the owner not themselves.
	jo.mustStatus(403, "DELETE", "/api/users/"+moID, nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	owner.mustStatus(200, "PUT", rootPath+"/members/"+joID, map[string]string{"role": "moderator"})
	mo.mustStatus(403, "DELETE", "/api/users/"+joID, nil)
	mo.mustStatus(403, "DELETE", "/api/users/"+ownerID, nil)
	owner.mustStatus(403, "DELETE", "/api/users/"+ownerID, nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+joID, map[string]string{"role": "member"})
	// People says who may be removed, per viewer.
	canRemove := func(c *client, id string) bool {
		t.Helper()
		for _, u := range c.mustStatus(200, "GET", "/api/users", nil)["users"].([]any) {
			if m := u.(map[string]any); m["id"] == id {
				return m["can"].(map[string]any)["remove"] == true
			}
		}
		t.Fatalf("%s not listed", id)
		return false
	}
	if !canRemove(owner, kitID) || !canRemove(owner, moID) || canRemove(owner, ownerID) {
		t.Fatal("the owner's view of who may be removed")
	}
	if !canRemove(mo, kitID) || !canRemove(mo, moID) || canRemove(mo, ownerID) {
		t.Fatal("a moderator's view: members and themselves, not the owner")
	}
	if canRemove(jo, kitID) || !canRemove(jo, joID) {
		t.Fatal("a member's view: only themselves")
	}

	// The owner removes kit.
	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
	kit.mustStatus(401, "GET", "/api/me", nil)
	if status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "kit", "password": "longenough"}); status != 401 {
		t.Fatalf("a removed account signs in: %d", status)
	}
	for _, u := range owner.mustStatus(200, "GET", "/api/users", nil)["users"].([]any) {
		if u.(map[string]any)["id"] == kitID {
			t.Fatal("removed, still on People")
		}
	}
	// Their words stay, under a removed name with no picture.
	removed := removedName(kitID)
	found := false
	for _, p := range owner.mustStatus(200, "GET", rootPath+"/posts?limit=50", nil)["posts"].([]any) {
		if pm := p.(map[string]any); pm["id"] == post["id"] {
			found = true
			if au := pm["author"].(map[string]any); au["id"] != kitID || au["username"] != removed || au["picture"] != nil {
				t.Fatalf("the removed person's post is by %v", au)
			}
		}
	}
	if !found {
		t.Fatal("the removed person's post is gone")
	}
	// The club passed to mo, its moderator, over jo; the solo room closed; the pair stays for mo under the removed name.
	for _, m := range mo.mustStatus(200, "GET", cp+"/members", nil)["members"].([]any) {
		mm := m.(map[string]any)
		switch mm["user"].(map[string]any)["id"] {
		case moID:
			if mm["role"] != "owner" {
				t.Fatalf("mo in the club: %v", mm["role"])
			}
		case kitID:
			t.Fatal("kit still in the club")
		}
	}
	if _, err := srv.q().GetGroup(context.Background(), solo["id"].(string)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("the room kit was alone in: %v", err)
	}
	if got := memberNames(myGroups(mo)[pid]); got != "mo,"+removed {
		t.Fatalf("the pair after: %q", got)
	}
	mo.mustStatus(200, "GET", "/api/groups/"+pid+"/messages", nil)
	// Nobody opens a conversation with, or adds, a removed person.
	mo.mustStatus(400, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID, joID}})
	mo.mustStatus(404, "POST", cp+"/members", map[string]string{"user_id": kitID})
	// Mo's stream carried the rename, the club's new owner, and kit leaving the club.
	var renamed, newOwner, left bool
	for _, e := range mo.readEvents(120) {
		p, _ := e["payload"].(map[string]any)
		switch e["kind"] {
		case "user":
			renamed = renamed || (p["id"] == kitID && p["username"] == removed)
		case "membership":
			newOwner = newOwner || (p["group_id"] == club["id"] && p["user"].(map[string]any)["id"] == moID && p["role"] == "owner")
		case "membership_delete":
			left = left || (p["group_id"] == club["id"] && p["user_id"] == kitID)
		}
	}
	if !renamed || !newOwner || !left {
		t.Fatalf("mo's stream: renamed %v, new owner %v, left %v", renamed, newOwner, left)
	}

	// Jo removes themselves; the removed name cannot be registered.
	jo.mustStatus(204, "DELETE", "/api/users/"+joID, nil)
	jo.mustStatus(401, "GET", "/api/me", nil)
	code := owner.mustStatus(201, "POST", "/api/invites", nil)["code"].(string)
	if status, body := newClient(t, ts).do("POST", "/api/register", map[string]string{"code": code, "username": "removed-anyone", "password": "longenough"}); status != 400 {
		t.Fatalf("registering a removed name: %d %v", status, body)
	}
}
