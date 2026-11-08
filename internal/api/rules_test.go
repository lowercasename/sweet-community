package api

import "testing"

// The community's rules (architecture.md, Admin tools). The owner and the
// moderators write them on the Community page. Signed-in users read them, and
// the join page shows them to someone holding an invite. They are not public.
func TestRules(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	anon := newClient(t, ts)
	anon.mustStatus(401, "GET", "/api/rules", nil)
	if r := kit.mustStatus(200, "GET", "/api/rules", nil); r["body_html"] != "" {
		t.Fatalf("rules before any are written: %v", r)
	}
	// A member cannot write them. The owner can, and the body is sanitised like any other.
	kit.mustStatus(403, "PUT", "/api/rules", map[string]string{"body_html": "<p>Be kind.</p>"})
	set := owner.mustStatus(200, "PUT", "/api/rules", map[string]string{"body_html": "<p>Be kind.<script>x()</script></p>"})
	if set["body_html"] != "<p>Be kind.</p>" {
		t.Fatalf("rules after writing: %v", set)
	}
	if r := kit.mustStatus(200, "GET", "/api/rules", nil); r["body_html"] != "<p>Be kind.</p>" {
		t.Fatalf("rules as a member reads them: %v", r)
	}
	// A moderator can write them too, and can clear them.
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	if r := myGroups(kit)[rootPath[len("/api/groups/"):]]; !groupCan(r, "manage_rules") {
		t.Fatalf("a moderator's root flags: %v", r["can"])
	}
	kit.mustStatus(200, "PUT", "/api/rules", map[string]string{"body_html": "<p>Be kind. Stay on topic.</p>"})
	// The join page shows them to someone with an invite.
	code := invite(t, owner)
	if inv := anon.mustStatus(200, "GET", "/api/invites/"+code, nil); inv["rules_html"] != "<p>Be kind. Stay on topic.</p>" {
		t.Fatalf("invite lookup: %v", inv)
	}
	// Writing them sends a rules event to every signed-in user.
	found := false
	for _, e := range owner.readEvents(80) {
		if e["kind"] == "rules" && e["payload"].(map[string]any)["body_html"] == "<p>Be kind. Stay on topic.</p>" {
			found = true
		}
	}
	if !found {
		t.Fatal("no rules event")
	}
	if r := kit.mustStatus(200, "PUT", "/api/rules", map[string]string{"body_html": "<p></p>"}); r["body_html"] != "" {
		t.Fatalf("cleared rules: %v", r)
	}
}
