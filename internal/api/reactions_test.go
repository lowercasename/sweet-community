package api

import (
	"reflect"
	"strings"
	"testing"
)

// reactionsOn returns an item's reactions as emoji → user ids, and the emoji in their order.
func reactionsOn(t *testing.T, v map[string]any) (map[string][]string, []string) {
	t.Helper()
	by := map[string][]string{}
	var order []string
	list, ok := v["reactions"].([]any)
	if !ok {
		t.Fatalf("no reactions list in %v", v)
	}
	for _, x := range list {
		r := x.(map[string]any)
		emoji := r["emoji"].(string)
		order = append(order, emoji)
		for _, id := range r["user_ids"].([]any) {
			by[emoji] = append(by[emoji], id.(string))
		}
	}
	return by, order
}

func react(c *client, kind, id, emoji string, on bool) map[string]any {
	c.t.Helper()
	return c.mustStatus(200, "PUT", "/api/"+kind+"s/"+id+"/reactions", map[string]any{"emoji": emoji, "reacted": on})
}

// A member reacts to a post, a comment and a message. Each emoji lists its users in the order they reacted, and the
// emoji are in the order of their first reaction. A member may add several emoji, and choosing one again removes it.
// Lists and single items carry the reactions.
func TestReactions(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a post</p>"})["id"].(string)
	comment := owner.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>a comment</p>"})["id"].(string)
	message := owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>a message</p>"})["id"].(string)

	for kind, id := range map[string]string{"post": post, "comment": comment, "message": message} {
		react(kit, kind, id, "👍", true)
		react(owner, kind, id, "❤️", true)
		react(owner, kind, id, "👍", true)
		got := react(kit, kind, id, "🧶", true)
		if got["id"] != id || got["kind"] != kind || got["group_id"] == nil {
			t.Fatalf("%s reaction response: %v", kind, got)
		}
		by, order := reactionsOn(t, got)
		if !reflect.DeepEqual(order, []string{"👍", "❤️", "🧶"}) || !reflect.DeepEqual(by["👍"], []string{kitID, ownerID}) {
			t.Fatalf("%s reactions: %v %v", kind, order, by)
		}
		react(kit, kind, id, "👍", false)
		by, _ = reactionsOn(t, react(kit, kind, id, "👍", false))
		if !reflect.DeepEqual(by["👍"], []string{ownerID}) {
			t.Fatalf("%s 👍 after kit took theirs back twice: %v", kind, by["👍"])
		}
	}

	posts := owner.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if by, _ := reactionsOn(t, posts[0].(map[string]any)); len(by["🧶"]) != 1 {
		t.Fatalf("the feed's post: %v", by)
	}
	if by, _ := reactionsOn(t, kit.mustStatus(200, "GET", "/api/posts/"+post, nil)); len(by["❤️"]) != 1 {
		t.Fatalf("GET post: %v", by)
	}
	comments := kit.mustStatus(200, "GET", "/api/posts/"+post+"/comments", nil)["comments"].([]any)
	if by, _ := reactionsOn(t, comments[0].(map[string]any)); len(by["🧶"]) != 1 {
		t.Fatalf("the comment: %v", by)
	}
	for _, x := range kit.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if m := x.(map[string]any); m["id"] == message {
			if by, _ := reactionsOn(t, m); len(by["🧶"]) != 1 {
				t.Fatalf("the message: %v", by)
			}
		}
	}
	// Editing a post sends the post again, with its reactions.
	edited := owner.mustStatus(200, "PUT", "/api/posts/"+post, map[string]string{"body_html": "<p>edited</p>"})
	if by, _ := reactionsOn(t, edited); len(by["❤️"]) != 1 {
		t.Fatalf("the edited post: %v", by)
	}
}

// A reaction is one emoji. An item holds at most 20 different emoji, and an emoji already on it can still be added.
// Chat lines take none, and a user who cannot see an item cannot react to it.
func TestReactionRules(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a post</p>"})["id"].(string)
	path := "/api/posts/" + post + "/reactions"

	refused := []string{"", "a", "👍👍", "👍 ", strings.Repeat("🏳️‍🌈", 5), "\x00", "a\u20e3", "\u20e3", "👍\ufe0e",
		"☺" + strings.Repeat("\u0301", 14), "a\ufe0f", "\ufe0f", "☃\ufe0f\ufe0f", "👍‍👍"}
	for _, emoji := range refused {
		if status, _ := kit.do("PUT", path, map[string]any{"emoji": emoji, "reacted": true}); status != 400 {
			t.Errorf("reacting with %q: %d, want 400", emoji, status)
		}
	}
	// Emoji the picker offers, including ones whose base character is punctuation or a letter, and long sequences.
	for _, emoji := range []string{"👍🏽", "🏳️‍🌈", "1️⃣", "🇬🇧", "❤️", "👩‍👩‍👧", "‼️", "ℹ️", "〰️", "👩🏻‍❤️‍💋‍👨🏻"} {
		react(kit, "post", post, emoji, true)
	}

	many := []rune("😀😁😂🤣😃😄😅😆😉😊")
	for _, r := range many {
		react(owner, "post", post, string(r), true)
	}
	// The post now holds 20 different emoji.
	status, body := kit.do("PUT", path, map[string]any{"emoji": "🧶", "reacted": true})
	if status != 409 || body["error"] != "A post, comment or message can have at most 20 different reactions" {
		t.Fatalf("a 21st emoji: %d %v", status, body)
	}
	react(kit, "post", post, "😀", true)

	var joined string
	for _, x := range owner.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if m := x.(map[string]any); m["kind"] == "joined" {
			joined = m["id"].(string)
		}
	}
	if status, _ := kit.do("PUT", "/api/messages/"+joined+"/reactions", map[string]any{"emoji": "👋", "reacted": true}); status != 400 {
		t.Fatalf("reacting to a joined line: %d, want 400", status)
	}

	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Staff", "mode": "both"})["id"].(string)
	secret := owner.mustStatus(201, "POST", "/api/groups/"+room+"/posts", map[string]string{"body_html": "<p>staff</p>"})["id"].(string)
	if status, _ := kit.do("PUT", "/api/posts/"+secret+"/reactions", map[string]any{"emoji": "👀", "reacted": true}); status != 404 {
		t.Fatalf("reacting in a room kit is not in: %d, want 404", status)
	}
	newClient(t, ts).mustStatus(401, "PUT", path, map[string]any{"emoji": "👍", "reacted": true})
}

// A reaction is sent on the stream to the members of the item's group only.
func TestReactionEvents(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+room+"/members", map[string]string{"user_id": kitID})
	message := owner.mustStatus(201, "POST", "/api/groups/"+room+"/messages", map[string]string{"body_html": "<p>hi</p>"})["id"].(string)
	react(kit, "message", message, "👋", true)

	seen := func(c *client) bool {
		for _, e := range c.readEvents(200) {
			if p, _ := e["payload"].(map[string]any); e["kind"] == "reactions" && p["id"] == message {
				return true
			}
		}
		return false
	}
	if !seen(owner) {
		t.Fatal("a member of the room got no reactions event")
	}
	if seen(mo) {
		t.Fatal("a user outside the room got the reactions event")
	}
}

// Deleting an item deletes its reactions and their events. Deleting a post also deletes those of its comments.
// Removing a user deletes their reactions. Deleting a room deletes the reactions in it.
func TestReactionsGoWithTheirItemsAndUsers(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a post</p>"})["id"].(string)
	comment := owner.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>a comment</p>"})["id"].(string)
	message := owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>a message</p>"})["id"].(string)
	kept := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kept</p>"})["id"].(string)
	react(kit, "post", post, "👍", true)
	react(kit, "comment", comment, "👍", true)
	react(kit, "message", message, "👍", true)
	react(kit, "post", kept, "👍", true)
	react(mo, "post", kept, "🧶", true)

	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+room+"/members", map[string]string{"user_id": moID})
	roomPost := owner.mustStatus(201, "POST", "/api/groups/"+room+"/posts", map[string]string{"body_html": "<p>room</p>"})["id"].(string)
	react(mo, "post", roomPost, "🧶", true)

	owner.mustStatus(200, "DELETE", "/api/posts/"+post, nil)
	owner.mustStatus(200, "DELETE", "/api/messages/"+message, nil)
	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
	owner.mustStatus(200, "DELETE", "/api/groups/"+room, nil)

	if by, _ := reactionsOn(t, owner.mustStatus(200, "GET", "/api/posts/"+kept, nil)); !reflect.DeepEqual(by, map[string][]string{"🧶": {moID}}) {
		t.Fatalf("the kept post after kit's removal: %v", by)
	}
	for _, e := range owner.readEvents(500) {
		p, _ := e["payload"].(map[string]any)
		if e["kind"] != "reactions" {
			continue
		}
		switch p["id"] {
		case post, comment, message, roomPost:
			t.Errorf("the log keeps the reactions of a deleted item: %v", p)
		case kept:
			t.Errorf("the log keeps reactions that name a removed user: %v", p)
		}
	}
}

// GET /api/me/reactions lists the emoji the viewer reacts with most, at most six, the most used first. Ties go to the
// one used last. Other users' reactions do not count.
func TestFrequentReactions(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	var posts []string
	for i := 0; i < 3; i++ {
		posts = append(posts, owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a post</p>"})["id"].(string))
	}
	for _, p := range posts {
		react(kit, "post", p, "🧶", true)
	}
	react(kit, "post", posts[0], "👍", true)
	react(kit, "post", posts[1], "👍", true)
	for _, e := range []string{"🎉", "🔥", "👀", "💯", "🌈"} {
		react(kit, "post", posts[2], e, true)
	}
	react(owner, "post", posts[0], "🍰", true)
	react(owner, "post", posts[1], "🍰", true)

	got := kit.mustStatus(200, "GET", "/api/me/reactions", nil)["emoji"]
	if !reflect.DeepEqual(got, []any{"🧶", "👍", "🌈", "💯", "👀", "🔥"}) {
		t.Fatalf("kit's frequent reactions: %v", got)
	}
	newClient(t, ts).mustStatus(401, "GET", "/api/me/reactions", nil)
}

func TestReactionPresentationFormsShareOneToggle(t *testing.T) {
	_, owner := newTestServer(t)
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a post</p>"})["id"].(string)
	for _, forms := range [][2]string{{"❤", "❤️"}, {"1⃣", "1️⃣"}, {"🏳‍🌈", "🏳️‍🌈"}} {
		react(owner, "post", post, forms[0], true)
		by, order := reactionsOn(t, react(owner, "post", post, forms[1], true))
		if len(order) != 1 || len(by[forms[1]]) != 1 {
			t.Fatalf("equivalent forms made separate reactions: %v", by)
		}
		_, order = reactionsOn(t, react(owner, "post", post, forms[0], false))
		if len(order) != 0 {
			t.Fatalf("removing the other presentation form left reactions: %v", order)
		}
	}
}

func TestRemovedUserReactionsLeaveNoContentSnapshots(t *testing.T) {
	for _, withdrawn := range []bool{false, true} {
		t.Run(map[bool]string{false: "current reaction", true: "withdrawn reaction"}[withdrawn], func(t *testing.T) {
			ts, owner := newTestServer(t)
			kit, kitID := registerMember(t, ts, owner, "kit")
			post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kept</p>"})["id"].(string)
			comment := owner.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>kept comment</p>"})["id"].(string)
			for kind, id := range map[string]string{"post": post, "comment": comment} {
				react(kit, kind, id, "👍", true)
				react(owner, kind, id, "🧶", true)
				owner.mustStatus(200, "PUT", "/api/"+kind+"s/"+id, map[string]string{"body_html": "<p>edited</p>"})
				if withdrawn {
					react(kit, kind, id, "👍", false)
				}
			}
			owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
			for _, e := range owner.readEvents(200) {
				p, _ := e["payload"].(map[string]any)
				if (e["kind"] == "post" && p["id"] == post) || (e["kind"] == "comment" && p["id"] == comment) {
					t.Errorf("a saved content event still contains the removed user's reaction: %s", e["kind"])
				}
			}
			by, _ := reactionsOn(t, owner.mustStatus(200, "GET", "/api/posts/"+post, nil))
			if len(by) != 1 || len(by["🧶"]) != 1 {
				t.Fatalf("removal changed the remaining member's reaction: %v", by)
			}
		})
	}
}
