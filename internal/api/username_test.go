package api

import "testing"

// A user changes their own username. The new name signs in and finds the profile, and the old name does neither. A
// "user" event carries the new name to every open page.
func TestChangeUsername(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	kit.mustStatus(204, "PUT", "/api/me/password", map[string]string{"password": "kit's password"})

	if got := kit.mustStatus(200, "PUT", "/api/me/username", map[string]string{"username": "kat"}); got["username"] != "kat" || got["id"] != kitID {
		t.Fatalf("the renamed user: %v", got)
	}
	if me := kit.mustStatus(200, "GET", "/api/me", nil); me["username"] != "kat" {
		t.Fatalf("GET /api/me after the rename: %v", me)
	}
	owner.mustStatus(200, "GET", "/api/users/kat", nil)
	owner.mustStatus(404, "GET", "/api/users/kit", nil)
	newClient(t, ts).login("kat", "kit's password")
	newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "kit", "password": "kit's password"})

	renamed := false
	for _, e := range owner.readEvents(200) {
		p, _ := e["payload"].(map[string]any)
		if e["kind"] == "user" && p["id"] == kitID && p["username"] == "kat" {
			renamed = true
		}
	}
	if !renamed {
		t.Fatal("no user event with the new name")
	}
}

// A username follows the same rules as at registration. Usernames ignore case, so a name that another user has in any
// case is taken. A user may change the case of their own name. Their old name is free for anyone at once.
func TestChangeUsernameRules(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	jo, _ := registerMember(t, ts, owner, "jo")

	for name, want := range map[string]struct {
		status int
		error  string
	}{
		"JO":    {409, "That username is taken"},
		"a b":   {400, "Usernames are 2 to 32 letters, digits or underscores"},
		"Admin": {400, "That username is reserved"},
	} {
		status, body := kit.do("PUT", "/api/me/username", map[string]string{"username": name})
		if status != want.status || body["error"] != want.error {
			t.Errorf("renaming to %q: %d %v, want %d %q", name, status, body, want.status, want.error)
		}
	}
	kit.mustStatus(200, "PUT", "/api/me/username", map[string]string{"username": "Kit"})
	kit.mustStatus(200, "PUT", "/api/me/username", map[string]string{"username": "kat"})
	jo.mustStatus(200, "PUT", "/api/me/username", map[string]string{"username": "kit"})
	newClient(t, ts).mustStatus(401, "PUT", "/api/me/username", map[string]string{"username": "nobody"})
}
