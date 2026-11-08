package api

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"sweet/internal/db"
	"sweet/internal/images"
	"sweet/internal/perm"
	"sweet/internal/store"
)

const rootPath = "/api/groups/" + perm.Root

func groupCan(g map[string]any, key string) bool {
	c, _ := g["can"].(map[string]any)
	v, _ := c[key].(bool)
	return v
}

func myGroups(c *client) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, g := range c.mustStatus(200, "GET", "/api/groups", nil)["groups"].([]any) {
		m := g.(map[string]any)
		out[m["id"].(string)] = m
	}
	return out
}

func TestRootGroupAndRoles(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)

	// Every user is in the root group. The owner's root membership includes their permissions.
	root := myGroups(owner)[perm.Root]
	if root["kind"] != "root" || root["role"] != "owner" || !groupCan(root, "add_members") || !groupCan(root, "set_roles") || !groupCan(root, "manage_instance") || groupCan(root, "leave") || groupCan(root, "delete") {
		t.Fatalf("owner's root group: %v", root)
	}
	if r := myGroups(kit)[perm.Root]; r["role"] != "member" || groupCan(r, "add_members") || groupCan(r, "set_roles") || groupCan(r, "manage_instance") || groupCan(r, "leave") {
		t.Fatalf("member's root group: %v", r)
	}

	// Only the owner can assign roles. The roles are member and moderator only, and cannot be assigned to the owner or to themselves.
	kit.mustStatus(403, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	owner.mustStatus(400, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "king"})
	owner.mustStatus(403, "PUT", rootPath+"/members/"+ownerID, map[string]string{"role": "member"})
	owner.mustStatus(404, "PUT", rootPath+"/members/nope", map[string]string{"role": "member"})
	m := owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	if m["role"] != "moderator" || m["user"].(map[string]any)["username"] != "kit" || m["group_id"] != perm.Root {
		t.Fatalf("promoted: %v", m)
	}
	// A role change keeps the same membership with a new role, so it keeps its joined time. A zero joined time once displayed as "1 Jan 1970".
	if joined := memberJoined(owner, rootPath, kitID); m["joined_at"] != joined || joined == float64(0) {
		t.Fatalf("promoted: joined_at %v, listed %v", m["joined_at"], joined)
	}
	events := kit.readEvents(30)
	if e := events[len(events)-1]; e["kind"] != "membership" || e["payload"].(map[string]any)["role"] != "moderator" {
		t.Fatalf("last event after promotion: %v", e)
	}

	// A moderator can create invites and delete anything. A moderator cannot edit other users' content or assign roles.
	kit.mustStatus(201, "POST", "/api/invites", nil)
	post := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mo's</p>"})
	kit.mustStatus(403, "PUT", "/api/posts/"+post["id"].(string), map[string]string{"body_html": "<p>no</p>"})
	kit.mustStatus(200, "DELETE", "/api/posts/"+post["id"].(string), nil)
	kit.mustStatus(403, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})

	// Kit is demoted. Nobody can leave the root group, and nobody can be removed from it.
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "member"})
	kit.mustStatus(403, "POST", "/api/invites", nil)
	kit.mustStatus(403, "DELETE", rootPath+"/members/"+kitID, nil)
	owner.mustStatus(403, "DELETE", rootPath+"/members/"+kitID, nil)
	// /api/users is the root membership list, with roles.
	for _, u := range owner.mustStatus(200, "GET", "/api/users", nil)["users"].([]any) {
		if u.(map[string]any)["username"] == "raphael" && u.(map[string]any)["role"] != "owner" {
			t.Fatalf("users list: %v", u)
		}
	}
}

func TestPrivateGroupIsInvisibleToNonMembers(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Knitting"})
	gid := g["id"].(string)
	if g["kind"] != "group" || g["role"] != "owner" || !groupCan(g, "add_members") || !groupCan(g, "rename") || !groupCan(g, "delete") || groupCan(g, "leave") {
		t.Fatalf("new group for its creator: %v", g)
	}
	gp := "/api/groups/" + gid

	// For any non-member, including the instance owner, every route on the group returns 404.
	for _, c := range []*client{mo, owner} {
		c.mustStatus(404, "GET", gp, nil)
		c.mustStatus(404, "GET", gp+"/posts", nil)
		c.mustStatus(404, "GET", gp+"/messages", nil)
		c.mustStatus(404, "GET", gp+"/members", nil)
		c.mustStatus(404, "POST", gp+"/posts", map[string]string{"body_html": "<p>x</p>"})
		c.mustStatus(404, "POST", gp+"/members", map[string]string{"user_id": moID})
		c.mustStatus(404, "PUT", gp, map[string]string{"name": "x"})
		c.mustStatus(404, "DELETE", gp, nil)
		if _, ok := myGroups(c)[gid]; ok {
			t.Fatalf("group listed for a non-member")
		}
	}

	// After the owner adds mo, mo can see the group, post in it, and receive updates about it.
	m := kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	if m["role"] != "member" || m["group_id"] != gid {
		t.Fatalf("membership: %v", m)
	}
	if got := myGroups(mo)[gid]; got == nil || got["name"] != "Knitting" || got["role"] != "member" || !groupCan(got, "leave") {
		t.Fatalf("mo's view of the group: %v", got)
	}
	post := mo.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>purl</p>"})
	if post["group_id"] != gid {
		t.Fatalf("post group: %v", post)
	}
	if n := len(kit.mustStatus(200, "GET", gp+"/posts", nil)["posts"].([]any)); n != 1 {
		t.Fatalf("posts in group: %d", n)
	}
	if n := len(kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)); n != 0 {
		t.Fatalf("group post leaked into the root feed: %d", n)
	}
	kit.mustStatus(201, "POST", gp+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	kit.mustStatus(200, "PUT", gp, map[string]string{"name": "Knitting circle"})
	mo.mustStatus(403, "PUT", gp, map[string]string{"name": "Mine now"})

	// The group's owner can delete a member's post. A member cannot delete the owner's post.
	kits := kit.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>knit</p>"})
	mo.mustStatus(403, "DELETE", "/api/posts/"+kits["id"].(string), nil)
	kit.mustStatus(200, "DELETE", "/api/posts/"+post["id"].(string), nil)

	// The instance owner is not a member and cannot change anything in the group.
	owner.mustStatus(404, "DELETE", "/api/posts/"+kits["id"].(string), nil)

	// Mo leaves. Kit is the owner and cannot leave. Kit then deletes the group, and the deletion is permanent.
	mo.mustStatus(204, "DELETE", gp+"/members/"+moID, nil)
	mo.mustStatus(404, "GET", gp+"/posts", nil)
	kitID := kit.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	kit.mustStatus(403, "DELETE", gp+"/members/"+kitID, nil)
	kit.mustStatus(200, "DELETE", gp, nil)
	kit.mustStatus(404, "GET", gp+"/posts", nil)
	kit.mustStatus(404, "PUT", "/api/posts/"+kits["id"].(string), map[string]string{"body_html": "<p>late</p>"})
	if _, ok := myGroups(kit)[gid]; ok {
		t.Fatal("deleted group still listed")
	}
}

func TestStreamIsFilteredPerViewer(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, _ := registerMember(t, ts, owner, "jo")

	g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Mods"})
	gid := g["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>secret</p>"})
	kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>public</p>"})

	kinds := func(c *client) string {
		var ks []string
		for _, e := range c.readEvents(50) {
			ks = append(ks, e["kind"].(string))
		}
		return strings.Join(ks, ",")
	}
	// Jo is only in the root group, so jo receives no group, no membership and no secret post.
	if got := kinds(jo); strings.Contains(got, "group") || strings.Count(got, "post") != 1 {
		t.Fatalf("jo's stream: %s", got)
	}
	// Mo was added, so mo receives their own membership, the secret post and
	// the public post. The group event is older than the membership and is not
	// replayed. The client fetches the group when it receives the membership.
	if got := kinds(mo); !strings.Contains(got, "membership") || strings.Count(got, "post") != 2 {
		t.Fatalf("mo's stream: %s", got)
	}
	// No user's stream includes the body of a post that user cannot see.
	for _, e := range jo.readEvents(50) {
		if p, ok := e["payload"].(map[string]any); ok && p["body_html"] == "<p>secret</p>" {
			t.Fatal("secret post reached a non-member")
		}
	}
}

func TestDMFindOrCreate(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, _ := registerMember(t, ts, owner, "jo")

	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	if dm["kind"] != "dm" || dm["name"] != "" {
		t.Fatalf("dm: %v", dm)
	}
	again := kit.mustStatus(200, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	if again["id"] != dm["id"] {
		t.Fatalf("second dm with the same people is a new group: %v vs %v", again["id"], dm["id"])
	}
	// A DM's name comes from its members, so every response that includes a DM
	// includes its members. This covers the create, the find and the GET. A
	// response without them once displayed "Just you".
	for what, g := range map[string]map[string]any{
		"created": dm,
		"found":   again,
		"fetched": kit.mustStatus(200, "GET", "/api/groups/"+dm["id"].(string), nil),
	} {
		if got := memberNames(g); got != "kit,mo" {
			t.Fatalf("%s dm members: %q, want kit,mo", what, got)
		}
	}
	kit.mustStatus(201, "POST", "/api/groups/"+dm["id"].(string)+"/messages", map[string]string{"body_html": "<p>psst</p>"})
	if got := myGroups(mo)[dm["id"].(string)]; got == nil {
		t.Fatal("mo does not see the dm")
	}
	if _, ok := myGroups(jo)[dm["id"].(string)]; ok {
		t.Fatal("jo sees a dm they are not in")
	}
	jo.mustStatus(404, "GET", "/api/groups/"+dm["id"].(string)+"/messages", nil)
	// In a DM both users have the same role. Nobody owns it or can rename it, and either user can leave.
	if dm["role"] != "member" || groupCan(dm, "rename") || groupCan(dm, "set_roles") || !groupCan(dm, "leave") {
		t.Fatalf("dm abilities: %v", dm)
	}
	// The group list includes the same members. A named group does not include members.
	if got := memberNames(myGroups(mo)[dm["id"].(string)]); got != "kit,mo" {
		t.Fatalf("listed dm members: %q", got)
	}
	if _, ok := myGroups(kit)[perm.Root]["members"]; ok {
		t.Fatal("a non-dm group carries members")
	}
}

// A conversation is identified by its members (architecture.md, Groups).
// There is one conversation per set of users, and nobody can be added. A
// message to someone else is a different conversation. Each member's hidden
// state is their own. Hiding a conversation removes it from that user's list
// and notifies nobody else. Opening it again shows it with its full history.
func TestConversationIsItsPeople(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	_, joID := registerMember(t, ts, owner, "jo")

	pair := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	pid := pair["id"].(string)
	pp := "/api/groups/" + pid
	if groupCan(pair, "add_members") || groupCan(pair, "remove_members") || !groupCan(pair, "leave") {
		t.Fatalf("conversation abilities: %v", pair)
	}
	kit.mustStatus(201, "POST", pp+"/messages", map[string]string{"body_html": "<p>between us</p>"})
	// Nobody can add a member, staff included. A conversation has exactly two users. A group of more users is a room.
	mo.mustStatus(403, "POST", pp+"/members", map[string]string{"user_id": joID})
	owner.mustStatus(404, "POST", pp+"/members", map[string]string{"user_id": joID})
	kit.mustStatus(400, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID, joID}})
	kit.mustStatus(400, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{}})
	if got := memberNames(kit.mustStatus(200, "GET", pp, nil)); got != "kit,mo" {
		t.Fatalf("the pair: %q", got)
	}

	// Mo hides the conversation. Mo can no longer read it. For kit it still has both users, and kit is not notified.
	if out := mo.mustStatus(200, "DELETE", pp+"/members/"+moID, nil); out["hidden_at"] == nil || out["user"].(map[string]any)["id"] != moID {
		t.Fatalf("hiding replies with the membership: %v", out)
	}
	mo.mustStatus(404, "GET", pp+"/messages", nil)
	if g := myGroups(mo)[pid]; g == nil || g["hidden_at"] == nil {
		t.Fatalf("mo's list after hiding: %v", g)
	}
	if got := memberNames(kit.mustStatus(200, "GET", pp, nil)); got != "kit,mo" {
		t.Fatalf("the pair after mo hid it: %q", got)
	}
	for _, m := range kit.mustStatus(200, "GET", pp+"/members", nil)["members"].([]any) {
		if mm := m.(map[string]any); mm["hidden_at"] != nil {
			t.Fatalf("kit is told who has hidden the conversation: %v", mm)
		}
	}
	for _, e := range kit.readEvents(80) {
		if p, ok := e["payload"].(map[string]any); ok && e["kind"] == "membership" && p["hidden_at"] != nil {
			t.Fatalf("kit's stream carries someone else's hiding: %v", p)
		}
	}
	kit.mustStatus(201, "POST", pp+"/messages", map[string]string{"body_html": "<p>while mo is away</p>"})
	// When both users hide it, nothing is deleted.
	kit.mustStatus(200, "DELETE", pp+"/members/"+kitID, nil)
	kit.mustStatus(404, "GET", pp, nil)

	// Mo opens the conversation with kit again. It is the same conversation, shown again, with all its messages.
	back := mo.mustStatus(200, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID}})
	if back["id"] != pid || back["hidden_at"] != nil {
		t.Fatalf("mo showing it again: %v", back)
	}
	if msgs := mo.mustStatus(200, "GET", pp+"/messages", nil)["messages"].([]any); len(msgs) != 2 {
		t.Fatalf("mo sees %d messages, want 2", len(msgs))
	}
	if g := myGroups(mo)[pid]; g == nil || g["hidden_at"] != nil {
		t.Fatalf("mo's list after showing it again: %v", g)
	}
}

// memberJoined returns one member's joined time from the group's members list.
func memberJoined(c *client, groupPath, userID string) any {
	for _, m := range c.mustStatus(200, "GET", groupPath+"/members", nil)["members"].([]any) {
		if mm := m.(map[string]any); mm["user"].(map[string]any)["id"] == userID {
			return mm["joined_at"]
		}
	}
	return nil
}

// memberNames returns the usernames of a DM's members in the wire payload,
// joined with commas. It returns "" when the payload has no members.
func memberNames(g map[string]any) string {
	members, _ := g["members"].([]any)
	names := []string{}
	for _, u := range members {
		names = append(names, u.(map[string]any)["username"].(string))
	}
	return strings.Join(names, ",")
}

func TestImagesFollowVisibility(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, _ := registerMember(t, ts, owner, "jo")

	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d %v", status, img)
	}
	url := img["url"].(string)
	// An unreferenced image is visible to its uploader only.
	kit.mustStatus(200, "GET", url, nil)
	mo.mustStatus(404, "GET", url, nil)

	g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Pics"})
	gid := g["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{
		"body_html": `<img src="` + url + `" alt="" width="40" height="40" data-image-id="` + img["id"].(string) + `">`,
	})
	mo.mustStatus(200, "GET", url, nil)
	jo.mustStatus(404, "GET", url, nil)
	owner.mustStatus(404, "GET", url, nil)
}

var _ = httptest.NewServer

func TestGroupModeAndInstanceSetting(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	// A group's only setting is its mode. A chat-only group has no feed.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Room", "mode": "chat"})
	rid := room["id"].(string)
	if room["mode"] != "chat" {
		t.Fatalf("mode: %v", room)
	}
	kit.mustStatus(403, "POST", "/api/groups/"+rid+"/posts", map[string]string{"body_html": "<p>x</p>"})
	kit.mustStatus(201, "POST", "/api/groups/"+rid+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	both := kit.mustStatus(200, "PUT", "/api/groups/"+rid, map[string]string{"mode": "both"})
	if both["mode"] != "both" || both["name"] != "Room" {
		t.Fatalf("mode change: %v", both)
	}
	// The response is the group as its owner sees it, including the flags. A
	// group without flags would remove the owner's controls as soon as they saved.
	if both["role"] != "owner" || !groupCan(both, "rename") || !groupCan(both, "set_mode") || !groupCan(both, "delete") {
		t.Fatalf("reply to an update is not personalised: %v", both)
	}
	kit.mustStatus(201, "POST", "/api/groups/"+rid+"/posts", map[string]string{"body_html": "<p>now ok</p>"})
	kit.mustStatus(400, "PUT", "/api/groups/"+rid, map[string]string{"mode": "video"})
	if g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Default"}); g["mode"] != "both" {
		t.Fatalf("default mode: %v", g)
	}
	// A DM is chat only, and its mode cannot be changed.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	if dm["mode"] != "chat" {
		t.Fatalf("dm mode: %v", dm)
	}
	kit.mustStatus(400, "PUT", "/api/groups/"+dm["id"].(string), map[string]string{"mode": "both"})
	kit.mustStatus(403, "POST", "/api/groups/"+dm["id"].(string)+"/posts", map[string]string{"body_html": "<p>x</p>"})

	// The instance's first setting controls who can create groups. Anyone can read the settings, because the login page shows the name. Only the owner can change them.
	kit.mustStatus(403, "PUT", "/api/settings", map[string]string{"group_creation": "staff", "name": "Knitting"})
	if s := kit.mustStatus(200, "GET", "/api/settings", nil); s["group_creation"] != "anyone" || s["name"] != "" || s["owner_set"] != true {
		t.Fatalf("default settings: %v", s)
	}
	if !groupCan(myGroups(mo)[perm.Root], "create_groups") {
		t.Fatal("member cannot create groups by default")
	}
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "nobody", "name": "Knitting"})
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "staff", "name": "Knitting"})
	if groupCan(myGroups(mo)[perm.Root], "create_groups") {
		t.Fatal("member can still create groups after the setting changed")
	}
	mo.mustStatus(403, "POST", "/api/groups", map[string]string{"name": "Nope"})
	owner.mustStatus(200, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	mo.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Mods may"})
	events := mo.readEvents(60)
	found := false
	for _, e := range events {
		if e["kind"] == "settings" && e["payload"].(map[string]any)["group_creation"] == "staff" {
			found = true
		}
	}
	if !found {
		t.Fatal("no settings event on the stream")
	}
}

func TestOwnershipNeverLapses(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, joID := registerMember(t, ts, owner, "jo")

	g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Club"})
	gid := g["id"].(string)
	gp := "/api/groups/" + gid
	kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": joID})

	// The owner cannot leave while they are the owner. Only the owner can transfer ownership.
	kit.mustStatus(403, "DELETE", gp+"/members/"+kitID, nil)
	mo.mustStatus(403, "PUT", gp+"/members/"+moID, map[string]string{"role": "owner"})
	if !groupCan(myGroups(kit)[gid], "transfer") || groupCan(myGroups(mo)[gid], "transfer") {
		t.Fatal("transfer flag")
	}
	kitJoined, moJoined := memberJoined(kit, gp, kitID), memberJoined(kit, gp, moID)
	m := kit.mustStatus(200, "PUT", gp+"/members/"+moID, map[string]string{"role": "owner"})
	if m["joined_at"] != moJoined || memberJoined(kit, gp, kitID) != kitJoined || memberJoined(kit, gp, moID) != moJoined {
		t.Fatalf("handover changed joined times: reply %v, kit %v→%v, mo %v→%v", m["joined_at"], kitJoined, memberJoined(kit, gp, kitID), moJoined, memberJoined(kit, gp, moID))
	}
	if m["role"] != "owner" {
		t.Fatalf("handover: %v", m)
	}
	if got := myGroups(kit)[gid]; got["role"] != "moderator" || groupCan(got, "transfer") || !groupCan(got, "leave") {
		t.Fatalf("former owner: %v", got)
	}
	if got := myGroups(mo)[gid]; got["role"] != "owner" || !groupCan(got, "rename") {
		t.Fatalf("new owner: %v", got)
	}
	// A group never has two owners. The old owner is now a moderator, and mo cannot make a second owner.
	mo.mustStatus(400, "PUT", gp+"/members/"+joID, map[string]string{"role": "king"})

	// Kit can now leave. A moderator leaving does not change the group.
	kit.mustStatus(204, "DELETE", gp+"/members/"+kitID, nil)
	mo.mustStatus(200, "GET", gp, nil)
	// The owner transfers ownership to jo and leaves. Jo is the last member, and the group is then deleted.
	mo.mustStatus(200, "PUT", gp+"/members/"+joID, map[string]string{"role": "owner"})
	mo.mustStatus(204, "DELETE", gp+"/members/"+moID, nil)
	jo.mustStatus(403, "DELETE", gp+"/members/"+joID, nil) // the owner of a one-person group must transfer ownership or delete it
	jo.mustStatus(200, "DELETE", gp, nil)
	if _, ok := myGroups(jo)[gid]; ok {
		t.Fatal("deleted group still listed")
	}

	// A conversation has no owner and is never deleted. Every member can hide it, and it is kept.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	dp := "/api/groups/" + dm["id"].(string)
	kit.mustStatus(200, "DELETE", dp+"/members/"+kitID, nil)
	mo.mustStatus(200, "GET", dp, nil)
	mo.mustStatus(200, "DELETE", dp+"/members/"+moID, nil)
	mo.mustStatus(404, "GET", dp, nil)
	// No member is left to receive the event on the stream, so the test reads the event log. It has a hidden membership and no deletion.
	rows, err := srv.q().ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 500})
	if err != nil {
		t.Fatal(err)
	}
	last := rows[len(rows)-1]
	if last.Kind != "membership" || !strings.Contains(last.Payload, dm["id"].(string)) || !strings.Contains(last.Payload, `"hidden_at":1`) {
		t.Fatalf("last event after everyone hid it: %s %s", last.Kind, last.Payload)
	}
	if back := mo.mustStatus(200, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID}}); back["id"] != dm["id"] {
		t.Fatalf("the pair opened again is %v, want %v", back["id"], dm["id"])
	}

	// The root group's owner can transfer ownership but can never leave.
	owner.mustStatus(403, "DELETE", rootPath+"/members/"+owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string), nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "owner"})
	if got := myGroups(kit)[perm.Root]; got["role"] != "owner" || !groupCan(got, "set_roles") {
		t.Fatalf("new instance owner: %v", got)
	}
	if got := myGroups(owner)[perm.Root]; got["role"] != "moderator" {
		t.Fatalf("former instance owner: %v", got)
	}
}

// A group includes the time of its newest message that is not deleted. The
// server computes it when it builds the response. The Messages page uses it
// to order DMs by latest activity, so the client keeps no second copy of any data.
func TestGroupsCarryLastActivity(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	_, moID := registerMember(t, ts, owner, "mo")

	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	id := dm["id"].(string)
	if v, ok := dm["last_message_at"]; !ok || v != nil {
		t.Fatalf("a new dm: last_message_at %v (present %v), want null", v, ok)
	}
	if v := myGroups(kit)[id]["last_message_at"]; v != nil {
		t.Fatalf("listed new dm: last_message_at %v, want null", v)
	}

	msg := kit.mustStatus(201, "POST", "/api/groups/"+id+"/messages", map[string]string{"body_html": "<p>psst</p>"})
	if got := myGroups(kit)[id]["last_message_at"]; got != msg["created_at"] {
		t.Fatalf("listed dm after a message: last_message_at %v, want %v", got, msg["created_at"])
	}
	if got := kit.mustStatus(200, "GET", "/api/groups/"+id, nil)["last_message_at"]; got != msg["created_at"] {
		t.Fatalf("fetched dm after a message: last_message_at %v, want %v", got, msg["created_at"])
	}
	// The root group includes it too, because every group has the same shape.
	if _, ok := myGroups(kit)[perm.Root]["last_message_at"]; !ok {
		t.Fatal("root group lacks last_message_at")
	}
	// After the only message is deleted, the group is as if the message was never sent.
	kit.mustStatus(200, "DELETE", "/api/messages/"+msg["id"].(string), nil)
	if v := myGroups(kit)[id]["last_message_at"]; v != nil {
		t.Fatalf("dm after deleting its only message: last_message_at %v, want null", v)
	}
}

// A room's picture (architecture.md, Groups). The owner sets it from an
// uploaded image. The group event includes it. Only the room's members can
// fetch the image. The sweep keeps it. A conversation has no picture.
func TestGroupPicture(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := room["id"].(string)
	gp := "/api/groups/" + gid
	kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	if room["picture"] != nil {
		t.Fatalf("a new room has a picture: %v", room)
	}

	status, img := kit.upload(testPNG(8, 8))
	if status != 201 {
		t.Fatalf("upload: %d %v", status, img)
	}
	iid := img["id"].(string)
	mo.mustStatus(403, "PUT", gp+"/picture", map[string]any{"image_id": iid})
	set := kit.mustStatus(200, "PUT", gp+"/picture", map[string]any{"image_id": iid})
	if set["picture"] != "/img/"+iid {
		t.Fatalf("picture after setting: %v", set["picture"])
	}
	if got := mo.mustStatus(200, "GET", gp, nil); got["picture"] != "/img/"+iid {
		t.Fatalf("mo's view of the room: %v", got["picture"])
	}
	var ev map[string]any
	for _, e := range mo.readEvents(80) {
		if e["kind"] == "group" {
			ev = e["payload"].(map[string]any)
		}
	}
	if ev["picture"] != "/img/"+iid {
		t.Fatalf("the group event carries no picture: %v", ev)
	}
	// Mo is in the room and can fetch the image. The instance owner is not in the room and cannot.
	if st, _ := mo.do("GET", "/img/"+iid, nil); st != 200 {
		t.Fatalf("a member fetching the room's picture: %d", st)
	}
	if st, _ := owner.do("GET", "/img/"+iid, nil); st != 404 {
		t.Fatalf("an outsider fetching the room's picture: %d", st)
	}
	// The sweep keeps a room's picture.
	if n, err := images.Sweep(context.Background(), store.New(srv.DB), srv.Images, db.Now()+1); err != nil || n != 0 {
		t.Fatalf("sweep took the room's picture: %d %v", n, err)
	}
	kit.mustStatus(404, "PUT", gp+"/picture", map[string]any{"image_id": "nothing"})
	if back := kit.mustStatus(200, "PUT", gp+"/picture", map[string]any{"image_id": nil}); back["picture"] != nil {
		t.Fatalf("a cleared picture: %v", back["picture"])
	}
	// A conversation has no picture.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	kit.mustStatus(403, "PUT", "/api/groups/"+dm["id"].(string)+"/picture", map[string]any{"image_id": iid})
}
