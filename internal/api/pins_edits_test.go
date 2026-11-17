package api

import (
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func TestPinnedPostsRespectPermissionsScopeAndPagination(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	p := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>First</p>"})
	id := p["id"].(string)
	path := "/api/posts/" + id + "/pin"
	kit.mustStatus(403, "PUT", path, map[string]bool{"pinned": true})
	before := kit.mustStatus(200, "GET", "/api/notifications", nil)
	pinned := mo.mustStatus(200, "PUT", path, map[string]bool{"pinned": true})
	if pinned["pinned"] != true || pinned["edited_at"] != nil || pinned["can"].(map[string]any)["pin"] != true {
		t.Fatalf("pinned post: %v", pinned)
	}
	if !reflect.DeepEqual(before, kit.mustStatus(200, "GET", "/api/notifications", nil)) {
		t.Fatal("pinning changed notifications")
	}
	if kit.mustStatus(200, "GET", "/api/posts/"+id, nil)["can"].(map[string]any)["pin"] == true {
		t.Fatal("author can pin without a staff role")
	}
	for i := 0; i < 3; i++ {
		owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": fmt.Sprintf("<p>Later %d</p>", i)})
	}
	first := kit.mustStatus(200, "GET", rootPath+"/posts?limit=2", nil)
	pins, ok := first["pinned"].([]any)
	if !ok || len(pins) != 1 || pins[0].(map[string]any)["id"] != id {
		t.Fatalf("old pin missing from first page: %v", first)
	}
	second := kit.mustStatus(200, "GET", rootPath+"/posts?limit=2&before="+url.QueryEscape(first["next_before"].(string)), nil)
	if len(second["posts"].([]any)) != 2 || second["next_before"] != nil {
		t.Fatalf("pagination: %v", second)
	}
	owner.mustStatus(400, "PUT", path, map[string]any{})
	owner.mustStatus(200, "PUT", path, map[string]bool{"pinned": false})
	if len(kit.mustStatus(200, "GET", rootPath+"/posts", nil)["pinned"].([]any)) != 0 {
		t.Fatal("unpin left pinned post")
	}
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"name": "Private", "mode": "both", "members": []string{kitID}})
	gp := "/api/groups/" + room["id"].(string)
	rp := kit.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>Room post</p>"})
	rpath := "/api/posts/" + rp["id"].(string) + "/pin"
	mo.mustStatus(404, "PUT", rpath, map[string]bool{"pinned": true})
	kit.mustStatus(403, "PUT", rpath, map[string]bool{"pinned": true})
	owner.mustStatus(200, "PUT", gp+"/members/"+kitID, map[string]string{"role": "moderator"})
	kit.mustStatus(200, "PUT", rpath, map[string]bool{"pinned": true})
	if len(kit.mustStatus(200, "GET", gp+"/posts", nil)["pinned"].([]any)) != 1 {
		t.Fatal("room pin missing")
	}
	kit.mustStatus(200, "DELETE", "/api/posts/"+rp["id"].(string), nil)
	kit.mustStatus(404, "PUT", rpath, map[string]bool{"pinned": true})
	if len(owner.mustStatus(200, "GET", gp+"/posts", nil)["pinned"].([]any)) != 0 {
		t.Fatal("deleted pin remains")
	}
	open := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Open", "visibility": "open"})
	ogid := open["id"].(string)
	op := mo.mustStatus(201, "POST", "/api/groups/"+ogid+"/posts", map[string]string{"body_html": "<p>Open pin</p>"})
	opath := "/api/posts/" + op["id"].(string)
	mo.mustStatus(403, "PUT", opath+"/pin", map[string]bool{"pinned": true})
	kit.mustStatus(200, "PUT", opath+"/pin", map[string]bool{"pinned": true})
	if len(mo.mustStatus(200, "GET", rootPath+"/posts", nil)["pinned"].([]any)) != 0 {
		t.Fatal("room pin promoted on Home")
	}
	moved := mo.mustStatus(200, "PUT", opath, map[string]string{"body_html": "<p>Moved pin</p>", "group_id": "00000000-0000-7000-8000-000000000000"})
	if moved["pinned"] != false {
		t.Fatal("moving carried pin to new group")
	}
	if len(mo.mustStatus(200, "GET", "/api/groups/"+ogid+"/posts", nil)["pinned"].([]any)) != 0 {
		t.Fatal("moved pin remains in old room")
	}
	var count int
	if err := srv.DB.QueryRow(`SELECT COUNT(*) FROM posts WHERE id=? AND body_html=''`, rp["id"]).Scan(&count); err != nil || count != 1 {
		t.Fatal("delete did not clear pinned post")
	}
}

func TestMessageEditingKeepsQuotesReactionsAndNotifications(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	original := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Original message</p>"})
	id := original["id"].(string)
	if original["can"].(map[string]any)["edit"] != true {
		t.Fatal("author cannot edit message")
	}
	reply := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>Answer</p>", "reply_to": id})
	mo.mustStatus(200, "PUT", "/api/messages/"+id+"/reactions", map[string]any{"emoji": "👍", "reacted": true})
	before := mo.mustStatus(200, "GET", "/api/notifications", nil)
	owner.mustStatus(403, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p>Staff rewrite</p>"})
	mo.mustStatus(403, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p>Rewrite</p>"})
	kit.mustStatus(400, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p></p>"})
	changed := kit.mustStatus(200, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p>Changed " + mentionOf(moID, "mo") + "</p><script>alert(1)</script>"})
	if changed["edited_at"] == nil || changed["created_at"] != original["created_at"] || strings.Contains(changed["body_html"].(string), "script") || len(changed["reactions"].([]any)) != 1 {
		t.Fatalf("edited message: %v", changed)
	}
	if !reflect.DeepEqual(before, mo.mustStatus(200, "GET", "/api/notifications", nil)) {
		t.Fatal("edit changed notifications")
	}
	kit.mustStatus(200, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p>Changed again</p>"})
	for _, x := range mo.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		m := x.(map[string]any)
		if m["id"] == reply["id"] && m["reply_to"].(map[string]any)["text"] != "Original message" {
			t.Fatalf("quote changed: %v", m)
		}
	}
	later := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>New answer</p>", "reply_to": id})
	if later["reply_to"].(map[string]any)["text"] != "Changed again" {
		t.Fatal("new reply did not quote current text")
	}
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"name": "Staff", "mode": "both"})
	secret := owner.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/messages", map[string]string{"body_html": "<p>Secret</p>"})
	kit.mustStatus(404, "PUT", "/api/messages/"+secret["id"].(string), map[string]string{"body_html": "<p>Guess</p>"})
	for _, x := range owner.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		m := x.(map[string]any)
		if m["kind"] != "message" {
			owner.mustStatus(403, "PUT", "/api/messages/"+m["id"].(string), map[string]string{"body_html": "<p>Notice</p>"})
			break
		}
	}
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	d := kit.mustStatus(201, "POST", "/api/groups/"+dm["id"].(string)+"/messages", map[string]string{"body_html": "<p>Private</p>"})
	kit.mustStatus(200, "PUT", "/api/messages/"+d["id"].(string), map[string]string{"body_html": "<p>Private edit</p>"})
	mo.mustStatus(403, "PUT", "/api/messages/"+d["id"].(string), map[string]string{"body_html": "<p>Other author</p>"})
	kit.mustStatus(200, "DELETE", "/api/messages/"+id, nil)
	kit.mustStatus(404, "PUT", "/api/messages/"+id, map[string]string{"body_html": "<p>Restore</p>"})
	var retained int
	if err := srv.DB.QueryRow(`SELECT COUNT(*) FROM messages WHERE reply_to=? AND reply_text != ''`, id).Scan(&retained); err != nil || retained != 0 {
		t.Fatalf("deleted quote retained: %d %v", retained, err)
	}
	_ = kitID
}

func TestMessageEditUpdatesSearchAndReleasesImages(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatal("upload failed")
	}
	m := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Watermelon</p>" + imgTag(img)})
	mo.mustStatus(200, "GET", img["url"].(string), nil)
	kit.mustStatus(200, "PUT", "/api/messages/"+m["id"].(string), map[string]string{"body_html": "<p>Apricot</p>"})
	mo.mustStatus(404, "GET", img["url"].(string), nil)
	hits := mo.mustStatus(200, "GET", "/api/search?q=Apricot", nil)
	if len(hits["hits"].([]any)) != 1 {
		t.Fatal("edited message missing from search")
	}
	old := mo.mustStatus(200, "GET", "/api/search?q=Watermelon", nil)
	if len(old["hits"].([]any)) != 0 {
		t.Fatal("old message text remains in search")
	}
}
