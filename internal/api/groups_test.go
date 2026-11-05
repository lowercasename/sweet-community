package api

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

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

	// Everyone is in the root group; the owner's root membership carries their abilities.
	root := myGroups(owner)[perm.Root]
	if root["kind"] != "root" || root["role"] != "owner" || !groupCan(root, "add_members") || !groupCan(root, "set_roles") || !groupCan(root, "manage_instance") || groupCan(root, "leave") || groupCan(root, "delete") {
		t.Fatalf("owner's root group: %v", root)
	}
	if r := myGroups(kit)[perm.Root]; r["role"] != "member" || groupCan(r, "add_members") || groupCan(r, "set_roles") || groupCan(r, "manage_instance") || groupCan(r, "leave") {
		t.Fatalf("member's root group: %v", r)
	}

	// Only the owner assigns roles, only member or moderator, never to the owner or to themselves.
	kit.mustStatus(403, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	owner.mustStatus(400, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "king"})
	owner.mustStatus(403, "PUT", rootPath+"/members/"+ownerID, map[string]string{"role": "member"})
	owner.mustStatus(404, "PUT", rootPath+"/members/nope", map[string]string{"role": "member"})
	m := owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	if m["role"] != "moderator" || m["user"].(map[string]any)["username"] != "kit" || m["group_id"] != perm.Root {
		t.Fatalf("promoted: %v", m)
	}
	events := kit.readEvents(30)
	if e := events[len(events)-1]; e["kind"] != "membership" || e["payload"].(map[string]any)["role"] != "moderator" {
		t.Fatalf("last event after promotion: %v", e)
	}

	// A moderator invites and deletes anything, edits nothing of others', and does not assign roles.
	kit.mustStatus(201, "POST", "/api/invites", nil)
	post := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mo's</p>"})
	kit.mustStatus(403, "PUT", "/api/posts/"+post["id"].(string), map[string]string{"body_html": "<p>no</p>"})
	kit.mustStatus(200, "DELETE", "/api/posts/"+post["id"].(string), nil)
	kit.mustStatus(403, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})

	// Demotion; nobody leaves the root; nobody is removed from it either.
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

	// To anyone else, the instance owner included, the group does not exist.
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

	// Added by the owner, mo sees it, posts in it, and hears about it.
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

	// The group's owner deletes a member's post; a member cannot delete the owner's.
	kits := kit.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>knit</p>"})
	mo.mustStatus(403, "DELETE", "/api/posts/"+kits["id"].(string), nil)
	kit.mustStatus(200, "DELETE", "/api/posts/"+post["id"].(string), nil)

	// The instance owner, not a member, still cannot touch anything in it.
	owner.mustStatus(404, "DELETE", "/api/posts/"+kits["id"].(string), nil)

	// mo leaves; kit, the owner, cannot; then kit deletes the group and it is gone for good.
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
	// jo is in the root only: no group, no membership, no secret post.
	if got := kinds(jo); strings.Contains(got, "group") || strings.Count(got, "post") != 1 {
		t.Fatalf("jo's stream: %s", got)
	}
	// mo was added: their own membership (the group event predates it and is
	// not replayed; the client fetches the group on the membership), the
	// secret post, the public post.
	if got := kinds(mo); !strings.Contains(got, "membership") || strings.Count(got, "post") != 2 {
		t.Fatalf("mo's stream: %s", got)
	}
	// Nobody's stream carries a secret body they cannot see.
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
	kit.mustStatus(201, "POST", "/api/groups/"+dm["id"].(string)+"/messages", map[string]string{"body_html": "<p>psst</p>"})
	if got := myGroups(mo)[dm["id"].(string)]; got == nil {
		t.Fatal("mo does not see the dm")
	}
	if _, ok := myGroups(jo)[dm["id"].(string)]; ok {
		t.Fatal("jo sees a dm they are not in")
	}
	jo.mustStatus(404, "GET", "/api/groups/"+dm["id"].(string)+"/messages", nil)
	// In a DM both people are equals: nobody owns it, nobody renames it, anyone may leave.
	if dm["role"] != "member" || groupCan(dm, "rename") || groupCan(dm, "set_roles") || !groupCan(dm, "leave") {
		t.Fatalf("dm abilities: %v", dm)
	}
	// A DM is named by its people, so it carries them; a named group does not.
	names := []string{}
	for _, u := range myGroups(mo)[dm["id"].(string)]["members"].([]any) {
		names = append(names, u.(map[string]any)["username"].(string))
	}
	if strings.Join(names, ",") != "kit,mo" {
		t.Fatalf("dm members: %v", names)
	}
	if _, ok := myGroups(kit)[perm.Root]["members"]; ok {
		t.Fatal("a non-dm group carries members")
	}
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
	// Unreferenced: the uploader's own, nobody else's.
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

	// A group's one setting is its mode; a chat-only group has no feed.
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
	// The reply is the group as its owner sees it, flags and all: a bare group
	// would strip the owner's controls the moment they saved.
	if both["role"] != "owner" || !groupCan(both, "rename") || !groupCan(both, "set_mode") || !groupCan(both, "delete") {
		t.Fatalf("reply to an update is not personalised: %v", both)
	}
	kit.mustStatus(201, "POST", "/api/groups/"+rid+"/posts", map[string]string{"body_html": "<p>now ok</p>"})
	kit.mustStatus(400, "PUT", "/api/groups/"+rid, map[string]string{"mode": "video"})
	if g := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Default"}); g["mode"] != "both" {
		t.Fatalf("default mode: %v", g)
	}
	// A DM is chat only, and stays so.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	if dm["mode"] != "chat" {
		t.Fatalf("dm mode: %v", dm)
	}
	kit.mustStatus(400, "PUT", "/api/groups/"+dm["id"].(string), map[string]string{"mode": "both"})
	kit.mustStatus(403, "POST", "/api/groups/"+dm["id"].(string)+"/posts", map[string]string{"body_html": "<p>x</p>"})

	// The instance's first setting: who may create groups. Owner-only to read and write.
	kit.mustStatus(403, "GET", "/api/settings", nil)
	kit.mustStatus(403, "PUT", "/api/settings", map[string]string{"group_creation": "staff"})
	if s := owner.mustStatus(200, "GET", "/api/settings", nil); s["group_creation"] != "anyone" {
		t.Fatalf("default setting: %v", s)
	}
	if !groupCan(myGroups(mo)[perm.Root], "create_groups") {
		t.Fatal("member cannot create groups by default")
	}
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "nobody"})
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "staff"})
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

	// The owner cannot leave while owner, and only the owner hands ownership over.
	kit.mustStatus(403, "DELETE", gp+"/members/"+kitID, nil)
	mo.mustStatus(403, "PUT", gp+"/members/"+moID, map[string]string{"role": "owner"})
	if !groupCan(myGroups(kit)[gid], "transfer") || groupCan(myGroups(mo)[gid], "transfer") {
		t.Fatal("transfer flag")
	}
	m := kit.mustStatus(200, "PUT", gp+"/members/"+moID, map[string]string{"role": "owner"})
	if m["role"] != "owner" {
		t.Fatalf("handover: %v", m)
	}
	if got := myGroups(kit)[gid]; got["role"] != "moderator" || groupCan(got, "transfer") || !groupCan(got, "leave") {
		t.Fatalf("former owner: %v", got)
	}
	if got := myGroups(mo)[gid]; got["role"] != "owner" || !groupCan(got, "rename") {
		t.Fatalf("new owner: %v", got)
	}
	// Two owners never: the old one is a moderator now, and mo cannot make a second.
	mo.mustStatus(400, "PUT", gp+"/members/"+joID, map[string]string{"role": "king"})

	// Now kit may leave; mods leaving changes nothing for the group.
	kit.mustStatus(204, "DELETE", gp+"/members/"+kitID, nil)
	mo.mustStatus(200, "GET", gp, nil)
	// The owner hands over to jo and leaves; jo, the last member, leaves and the group is gone.
	mo.mustStatus(200, "PUT", gp+"/members/"+joID, map[string]string{"role": "owner"})
	mo.mustStatus(204, "DELETE", gp+"/members/"+moID, nil)
	jo.mustStatus(403, "DELETE", gp+"/members/"+joID, nil) // owner of a one-person group: hand over or delete
	jo.mustStatus(200, "DELETE", gp, nil)
	if _, ok := myGroups(jo)[gid]; ok {
		t.Fatal("deleted group still listed")
	}

	// A DM has no owner: the last person leaving deletes it.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	dp := "/api/groups/" + dm["id"].(string)
	kit.mustStatus(204, "DELETE", dp+"/members/"+kitID, nil)
	mo.mustStatus(200, "GET", dp, nil)
	mo.mustStatus(204, "DELETE", dp+"/members/"+moID, nil)
	mo.mustStatus(404, "GET", dp, nil)
	// Nobody is left to receive it on the stream, so the log is the witness.
	rows, err := srv.q().ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 500})
	if err != nil {
		t.Fatal(err)
	}
	last := rows[len(rows)-1]
	if last.Kind != "group_delete" || !strings.Contains(last.Payload, dm["id"].(string)) {
		t.Fatalf("last event after the last member left: %s %s", last.Kind, last.Payload)
	}

	// The root group: its owner can hand over, but never leave.
	owner.mustStatus(403, "DELETE", rootPath+"/members/"+owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string), nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "owner"})
	if got := myGroups(kit)[perm.Root]; got["role"] != "owner" || !groupCan(got, "set_roles") {
		t.Fatalf("new instance owner: %v", got)
	}
	if got := myGroups(owner)[perm.Root]; got["role"] != "moderator" {
		t.Fatalf("former instance owner: %v", got)
	}
}
