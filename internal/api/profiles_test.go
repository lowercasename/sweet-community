package api

import (
	"reflect"
	"strings"
	"testing"
)

// Profiles. A profile is fetched by username. It
// includes the user's role and a bio that only they can edit, sanitised like
// any body. The user's posts are listed as the viewer is allowed to see them,
// from the groups the viewer is in. A removed account has no profile.
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

	// The bio is a body. It is sanitised and can be emptied. The response and the event both equal the profile that GET returns.
	set := kit.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": "<p>I knit<script>x()</script></p>"})
	if set["bio_html"] != "<p>I knit</p>" {
		t.Fatalf("bio after sanitising: %v", set["bio_html"])
	}
	fetched := mo.mustStatus(200, "GET", "/api/users/kit", nil)
	if fetched["bio_html"] != "<p>I knit</p>" {
		t.Fatalf("mo's view of kit's bio: %v", fetched)
	}
	for name, viewer := range map[string]*client{"self": kit, "member": mo, "staff": owner} {
		fetched := viewer.mustStatus(200, "GET", "/api/users/kit", nil)
		if name == "self" && !reflect.DeepEqual(set, fetched) {
			t.Fatal("the saved profile differs from a fetch")
		}
		var ev map[string]any
		for _, e := range viewer.readEvents(80) {
			if e["kind"] == "profile" {
				ev = e["payload"].(map[string]any)
			}
		}
		if !reflect.DeepEqual(ev, fetched) {
			t.Errorf("%s: the profile event differs from a fetch\nevent: %v\nfetch: %v", name, ev, fetched)
		}
	}
	if got := kit.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": "<p></p>"}); got["bio_html"] != "" {
		t.Fatalf("an emptied bio: %v", got["bio_html"])
	}
	kit.mustStatus(400, "PUT", "/api/me/bio", "not json")

	// Kit's own post list has both posts. Mo is not in the room and sees only the root group's post, with mo's own flags.
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

	// A removed user has no profile and no posts page.
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)
	kit.mustStatus(404, "GET", "/api/users/mo", nil)
}

// A bio, the rules and the welcome message hold no images and no preview cards. They are removed when the text is
// saved. A text saved before this rule is shown as it was stored, because old user content is never changed.
func TestBiosAndCommunityTextsHoldNoImagesOrCards(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	status, img := kit.upload(testPNG(20, 20))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	body := `<p>I knit</p>` + imgTag(img) + `<p data-embed=""><a href="https://example.com">https://example.com</a></p>`
	plain := func(name, html string) {
		t.Helper()
		if strings.Contains(html, "<img") || strings.Contains(html, "data-embed") || !strings.Contains(html, "I knit") {
			t.Fatalf("%s: %s", name, html)
		}
	}
	plain("bio", kit.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": body})["bio_html"].(string))
	for _, path := range []string{"/api/rules", "/api/welcome"} {
		plain(path, owner.mustStatus(200, "PUT", path, map[string]string{"body_html": body})["body_html"].(string))
	}
	// A bio stored before the rule is shown as it was stored.
	if _, err := srv.DB.Exec(`UPDATE users SET bio_html = ? WHERE username = 'kit'`, body); err != nil {
		t.Fatal(err)
	}
	if got := owner.mustStatus(200, "GET", "/api/users/kit", nil)["bio_html"]; got != body {
		t.Fatalf("an old bio as read: %v", got)
	}
}
