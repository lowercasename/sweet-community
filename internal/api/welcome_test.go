package api

import "testing"

// TestWelcome covers the welcome message (architecture.md, Admin tools). It works like the rules: every member reads
// it, and the owner and moderators write it.
func TestWelcome(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	anon := newClient(t, ts)
	anon.mustStatus(401, "GET", "/api/welcome", nil)
	if r := kit.mustStatus(200, "GET", "/api/welcome", nil); r["body_html"] != "" {
		t.Fatalf("welcome message before any is written: %v", r)
	}
	// A member cannot write it. The owner can, and the body is sanitised like any other.
	kit.mustStatus(403, "PUT", "/api/welcome", map[string]string{"body_html": "<p>Hello.</p>"})
	if r := myGroups(kit)[rootPath[len("/api/groups/"):]]; groupCan(r, "manage_welcome") {
		t.Fatalf("a member's root flags: %v", r["can"])
	}
	set := owner.mustStatus(200, "PUT", "/api/welcome", map[string]string{"body_html": "<p>Hello.<script>x()</script></p>"})
	if set["body_html"] != "<p>Hello.</p>" {
		t.Fatalf("welcome message after writing: %v", set)
	}
	if r := kit.mustStatus(200, "GET", "/api/welcome", nil); r["body_html"] != "<p>Hello.</p>" {
		t.Fatalf("welcome message as a member reads it: %v", r)
	}
	// The rules are a separate text.
	if r := kit.mustStatus(200, "GET", "/api/rules", nil); r["body_html"] != "" {
		t.Fatalf("rules after writing the welcome message: %v", r)
	}
	// A moderator can write it too, and can clear it.
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	if r := myGroups(kit)[rootPath[len("/api/groups/"):]]; !groupCan(r, "manage_welcome") {
		t.Fatalf("a moderator's root flags: %v", r["can"])
	}
	kit.mustStatus(200, "PUT", "/api/welcome", map[string]string{"body_html": "<p>Hello. Say hi in the chat.</p>"})
	// Writing it sends a welcome event to every signed-in user.
	found := false
	for _, e := range owner.readEvents(80) {
		if e["kind"] == "welcome" && e["payload"].(map[string]any)["body_html"] == "<p>Hello. Say hi in the chat.</p>" {
			found = true
		}
	}
	if !found {
		t.Fatal("no welcome event")
	}
	if r := kit.mustStatus(200, "PUT", "/api/welcome", map[string]string{"body_html": "<p></p>"}); r["body_html"] != "" {
		t.Fatalf("cleared welcome message: %v", r)
	}
}

// TestWelcomed covers the flag that records that a user has closed the welcome dialog. It is per user, it starts
// false, and it only moves to true, so a client that saves the digest without it does not show the dialog again.
func TestWelcomed(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	if got := kit.mustStatus(200, "GET", "/api/me/settings", nil); got["welcomed"] != false {
		t.Fatalf("a new member: %v", got)
	}
	if got := kit.mustStatus(200, "PUT", "/api/me/settings", map[string]any{"digest": "weekly", "welcomed": true}); got["welcomed"] != true {
		t.Fatalf("after closing the dialog: %v", got)
	}
	if got := kit.mustStatus(200, "PUT", "/api/me/settings", map[string]any{"digest": "off"}); got["welcomed"] != true || got["digest"] != "off" {
		t.Fatalf("after saving the digest alone: %v", got)
	}
	if got := kit.mustStatus(200, "PUT", "/api/me/settings", map[string]any{"digest": "off", "welcomed": false}); got["welcomed"] != true {
		t.Fatalf("after sending false: %v", got)
	}
	if got := owner.mustStatus(200, "GET", "/api/me/settings", nil); got["welcomed"] != false {
		t.Fatalf("someone else's: %v", got)
	}
}
