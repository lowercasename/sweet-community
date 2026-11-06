package api

import (
	"reflect"
	"testing"
)

// Profiles (architecture.md, Accounts): a person by name, with their standing
// and a bio they alone edit, sanitised like any body; their posts as the
// viewer may see them, from the groups the viewer is in. A removed account
// has no profile.
func TestProfiles(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	p := mo.mustStatus(200, "GET", "/api/users/raphael", nil)
	if p["role"] != "owner" || p["username"] != "raphael" || p["bio_html"] != "" || p["can"].(map[string]any)["edit"] != false {
		t.Fatalf("the owner's profile as mo sees it: %v", p)
	}
	mine := kit.mustStatus(200, "GET", "/api/users/kit", nil)
	if mine["can"].(map[string]any)["edit"] != true || mine["id"] != kitID {
		t.Fatalf("kit's own profile: %v", mine)
	}
	kit.mustStatus(404, "GET", "/api/users/nobody", nil)

	// The bio is a body: sanitised, and it may be emptied. The reply and the event are the profile as fetched.
	set := kit.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": "<p>I knit<script>x()</script></p>"})
	if set["bio_html"] != "<p>I knit</p>" {
		t.Fatalf("bio after sanitising: %v", set["bio_html"])
	}
	fetched := mo.mustStatus(200, "GET", "/api/users/kit", nil)
	if fetched["bio_html"] != "<p>I knit</p>" {
		t.Fatalf("mo's view of kit's bio: %v", fetched)
	}
	var ev map[string]any
	for _, e := range mo.readEvents(80) {
		if e["kind"] == "profile" {
			ev = e["payload"].(map[string]any)
		}
	}
	if !reflect.DeepEqual(ev, fetched) {
		t.Fatalf("the profile event differs from a fetch\nevent: %v\nfetch: %v", ev, fetched)
	}
	if got := kit.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": "<p></p>"}); got["bio_html"] != "" {
		t.Fatalf("an emptied bio: %v", got["bio_html"])
	}
	kit.mustStatus(400, "PUT", "/api/me/bio", "not json")

	// Posts: kit's own list has both; mo, not in the room, sees only the root's, with mo's own flags.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	kit.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/posts", map[string]string{"body_html": "<p>wool</p>"})
	open := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello all</p>"})
	own := kit.mustStatus(200, "GET", "/api/users/kit/posts", nil)["posts"].([]any)
	if len(own) != 2 || own[0].(map[string]any)["id"] != open["id"] {
		t.Fatalf("kit's own posts: %v", own)
	}
	seen := mo.mustStatus(200, "GET", "/api/users/kit/posts", nil)["posts"].([]any)
	if len(seen) != 1 || seen[0].(map[string]any)["id"] != open["id"] {
		t.Fatalf("kit's posts as mo sees them: %v", seen)
	}
	if e, d := can(seen[0].(map[string]any)); e || d {
		t.Fatalf("mo's flags on kit's post: edit %v delete %v", e, d)
	}
	if e, d := can(own[1].(map[string]any)); !e || !d {
		t.Fatalf("kit's flags on kit's post: edit %v delete %v", e, d)
	}
	mo.mustStatus(404, "GET", "/api/users/nobody/posts", nil)

	// Removed: no profile, no posts page.
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)
	kit.mustStatus(404, "GET", "/api/users/mo", nil)
}
