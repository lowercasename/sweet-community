package api

import (
	"testing"
)

// Mentions. A mention span in a body
// identifies a user by id. Each mentioned user who is in the group, other
// than the author, is notified. This applies to posts, comments and
// messages. An edit sends no new notifications.
func TestMentions(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, joID := registerMember(t, ts, owner, "jo")
	mention := func(id, name string) string {
		return `<span data-type="mention" data-mention-id="` + id + `">@` + name + `</span>`
	}
	list := func(c *client) []map[string]any {
		var out []map[string]any
		for _, x := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
			out = append(out, x.(map[string]any))
		}
		return out
	}

	// A post in a room that jo is not in mentions mo (a member), jo (not a member) and kit (the author). Only mo is notified.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := room["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	body := "<p>hey " + mention(moID, "mo") + " " + mention(joID, "jo") + " " + mention(kitID, "kit") + "</p>"
	post := kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": body})
	pid := post["id"].(string)
	got := list(mo)
	if len(got) != 2 || got[0]["kind"] != "mention" || got[0]["post_id"] != pid || got[0]["group_id"] != gid || got[0]["actor"].(map[string]any)["id"] != kitID {
		t.Fatalf("mo's notifications (added, then mentioned): %v", got)
	}
	if len(list(jo)) != 0 || len(list(kit)) != 0 {
		t.Fatalf("jo or kit told: %v %v", list(jo), list(kit))
	}
	// An edit sends no new notifications.
	kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": body + "<p>more</p>"})
	if len(list(mo)) != 2 {
		t.Fatalf("an edit mentioned mo again: %v", list(mo))
	}

	// A comment that mentions the post's author notifies them once, as a mention. A comment that mentions a third member notifies them as a mention.
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>" + mention(kitID, "kit") + " yes</p>"})
	if got := list(kit); len(got) != 1 || got[0]["kind"] != "mention" {
		t.Fatalf("kit, mentioned in a comment on kit's own post: %v", got)
	}
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": joID})
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>" + mention(joID, "jo") + " look</p>"})
	if got := list(jo); len(got) != 2 || got[0]["kind"] != "mention" || got[0]["post_id"] != pid {
		t.Fatalf("jo, mentioned in a comment: %v", got)
	}

	// A message that mentions a user notifies them, with the room's group id and no post id.
	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>" + mention(joID, "jo") + " chat?</p>"})
	if got := list(jo); len(got) != 3 || got[0]["kind"] != "mention" || got[0]["post_id"] != nil || got[0]["group_id"] != gid {
		t.Fatalf("jo, mentioned in chat: %v", got)
	}

}
