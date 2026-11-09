package api

import (
	"context"
	"strings"
	"testing"

	"sweet/internal/db"
	"sweet/internal/images"
	"sweet/internal/push"
)

// reportsOf returns the open reports the client can see, one entry per reported item.
func reportsOf(c *client) []map[string]any {
	c.t.Helper()
	var out []map[string]any
	for _, r := range c.mustStatus(200, "GET", "/api/reports", nil)["reports"].([]any) {
		out = append(out, r.(map[string]any))
	}
	return out
}

// reportNotes returns the client's report notifications.
func reportNotes(c *client) []map[string]any {
	c.t.Helper()
	var out []map[string]any
	for _, n := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
		if m := n.(map[string]any); m["kind"] == "report" {
			out = append(out, m)
		}
	}
	return out
}

func canReport(v map[string]any) bool {
	c, _ := v["can"].(map[string]any)
	r, _ := c["report"].(bool)
	return r
}

// Reporting. Any member except the author reports a post, comment or message. The
// owner and the moderators are notified, see one entry per reported item with a copy of the body as it was when it
// was first reported, and close it by dismissing the reports or by deleting the item. The author is not told who
// reported them, and members see nothing of reports.
func TestReports(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	jo, joID := registerMember(t, ts, owner, "jo")
	owner.mustStatus(200, "PUT", rootPath+"/members/"+joID, map[string]string{"role": "moderator"})

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Buy my stuff</p>"})
	pid := post["id"].(string)
	// The post carries can.report for everyone but its author.
	if canReport(post) {
		t.Fatalf("the author can report their own post: %v", post["can"])
	}
	if p := mo.mustStatus(200, "GET", "/api/posts/"+pid, nil); !canReport(p) {
		t.Fatalf("another member cannot report the post: %v", p["can"])
	}
	kit.mustStatus(403, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid})
	mo.mustStatus(404, "POST", "/api/reports", map[string]string{"kind": "post", "id": "nope"})
	mo.mustStatus(400, "POST", "/api/reports", map[string]string{"kind": "poll", "id": pid})
	mo.mustStatus(400, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid, "reason": strings.Repeat("x", 501)})

	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid, "reason": "  Spam link  "})
	// A second report by the same member changes nothing and notifies nobody again.
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid, "reason": "Again"})
	for name, c := range map[string]*client{"owner": owner, "jo": jo} {
		notes := reportNotes(c)
		if len(notes) != 1 || notes[0]["report_kind"] != "post" || notes[0]["actor"].(map[string]any)["username"] != "mo" || notes[0]["read_at"] != nil {
			t.Fatalf("%s's report notifications: %v", name, notes)
		}
	}
	for name, c := range map[string]*client{"kit": kit, "mo": mo} {
		if notes := reportNotes(c); len(notes) != 0 {
			t.Fatalf("%s was notified of a report: %v", name, notes)
		}
	}

	// Members cannot list reports. The entry keeps the body as it was reported, after the author edits it.
	kit.mustStatus(403, "GET", "/api/reports", nil)
	mo.mustStatus(403, "GET", "/api/reports", nil)
	kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": "<p>Nothing to see</p>"})
	// A moderator can report too. The owner is notified, and the moderator is not notified of their own report.
	jo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid})
	if notes := reportNotes(owner); len(notes) != 2 {
		t.Fatalf("owner's report notifications after jo's report: %v", notes)
	}
	if notes := reportNotes(jo); len(notes) != 1 {
		t.Fatalf("jo was notified of their own report: %v", notes)
	}
	list := reportsOf(owner)
	if len(list) != 1 {
		t.Fatalf("reports: %v", list)
	}
	r := list[0]
	reports := r["reports"].([]any)
	first := reports[0].(map[string]any)
	if r["kind"] != "post" || r["id"] != pid || r["body_html"] != "<p>Buy my stuff</p>" || r["deleted"] != false ||
		r["author"].(map[string]any)["username"] != "kit" || r["group_kind"] != "root" || !groupCan(r, "open") ||
		len(reports) != 2 || first["reporter"].(map[string]any)["username"] != "mo" || first["reason"] != "Spam link" {
		t.Fatalf("report entry: %v", r)
	}

	// Dismissing closes every report of the item and marks each staff member's notification read. The post stays.
	kit.mustStatus(403, "POST", "/api/reports/post/"+pid+"/dismiss", nil)
	owner.mustStatus(204, "POST", "/api/reports/post/"+pid+"/dismiss", nil)
	owner.mustStatus(404, "POST", "/api/reports/post/"+pid+"/dismiss", nil)
	if list := reportsOf(jo); len(list) != 0 {
		t.Fatalf("reports after dismissing: %v", list)
	}
	for name, c := range map[string]*client{"owner": owner, "jo": jo} {
		for _, n := range reportNotes(c) {
			if n["read_at"] == nil {
				t.Fatalf("%s's report notification is unread after dismissing: %v", name, n)
			}
		}
	}
	mo.mustStatus(200, "GET", "/api/posts/"+pid, nil)

	// Report events reach the owner and moderators only.
	kinds := func(c *client) map[string]bool {
		out := map[string]bool{}
		for _, e := range c.readEvents(200) {
			out[e["kind"].(string)] = true
		}
		return out
	}
	if k := kinds(jo); !k["report_delete"] {
		t.Fatalf("a moderator's events: %v", k)
	}
	for name, c := range map[string]*client{"kit": kit, "mo": mo} {
		if k := kinds(c); k["report"] || k["report_delete"] {
			t.Fatalf("%s received report events: %v", name, k)
		}
	}
}

// Deleting through a report works wherever the item is, including a room or a conversation that the moderator is
// not in, because the member's report brings the item to the moderators. Open is offered
// only for an item the moderator can see that is not in a conversation.
func TestReportedItemsAreDeletedAnywhere(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	// A post in a room the owner is not in. The owner cannot report it, because they cannot see it.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Knitting"})
	gid := room["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	post := kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>Room post</p>"})
	pid := post["id"].(string)
	owner.mustStatus(404, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid})
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": pid})
	list := reportsOf(owner)
	if len(list) != 1 || list[0]["group_kind"] != "group" || list[0]["group_name"] != "Knitting" || groupCan(list[0], "open") {
		t.Fatalf("report of a room post: %v", list)
	}
	owner.mustStatus(204, "POST", "/api/reports/post/"+pid+"/delete", nil)
	mo.mustStatus(404, "GET", "/api/posts/"+pid, nil)
	if list := reportsOf(owner); len(list) != 0 {
		t.Fatalf("reports after deleting: %v", list)
	}

	// A message in a conversation.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	msg := kit.mustStatus(201, "POST", "/api/groups/"+dm["id"].(string)+"/messages", map[string]string{"body_html": "<p>Rude</p>"})
	mid := msg["id"].(string)
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "message", "id": mid, "reason": "Rude"})
	list = reportsOf(owner)
	if len(list) != 1 || list[0]["kind"] != "message" || list[0]["group_kind"] != "dm" || groupCan(list[0], "open") {
		t.Fatalf("report of a conversation message: %v", list)
	}
	owner.mustStatus(204, "POST", "/api/reports/message/"+mid+"/delete", nil)
	for _, m := range mo.mustStatus(200, "GET", "/api/groups/"+dm["id"].(string)+"/messages", nil)["messages"].([]any) {
		if m.(map[string]any)["id"] == mid {
			t.Fatal("the reported message is still listed after deleting it")
		}
	}

	// A comment on the community's feed.
	home := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Home post</p>"})
	c := mo.mustStatus(201, "POST", "/api/posts/"+home["id"].(string)+"/comments", map[string]string{"body_html": "<p>Mean</p>"})
	cid := c["id"].(string)
	kit.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "comment", "id": cid})
	list = reportsOf(owner)
	if len(list) != 1 || list[0]["post_id"] != home["id"] || !groupCan(list[0], "open") {
		t.Fatalf("report of a comment: %v", list)
	}
	owner.mustStatus(204, "POST", "/api/reports/comment/"+cid+"/delete", nil)
	if cs := kit.mustStatus(200, "GET", "/api/posts/"+home["id"].(string)+"/comments", nil)["comments"].([]any); len(cs) != 0 {
		t.Fatalf("comments after deleting the reported one: %v", cs)
	}
}

// An item deleted since it was reported stays listed, marked deleted, until a moderator closes the report. Removing
// a user closes the reports of their content and clears the copies of it.
func TestReportsOfDeletedItemsAndRemovedUsers(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")

	gone := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Oops</p>"})
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": gone["id"].(string)})
	kit.mustStatus(200, "DELETE", "/api/posts/"+gone["id"].(string), nil)
	list := reportsOf(owner)
	if len(list) != 1 || list[0]["deleted"] != true || groupCan(list[0], "open") {
		t.Fatalf("report of a deleted post: %v", list)
	}
	mo.mustStatus(404, "POST", "/api/reports", map[string]string{"kind": "post", "id": gone["id"].(string)})
	owner.mustStatus(204, "POST", "/api/reports/post/"+gone["id"].(string)+"/delete", nil)

	kept := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Private words</p>"})
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": kept["id"].(string)})
	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
	if list := reportsOf(owner); len(list) != 0 {
		t.Fatalf("reports after removing the author: %v", list)
	}
	var left int
	if err := srv.DB.QueryRow(`SELECT COUNT(*) FROM reports WHERE author_id = ? AND body_html != ''`, kitID).Scan(&left); err != nil || left != 0 {
		t.Fatalf("copies of a removed user's content: %d %v", left, err)
	}
	for _, n := range reportNotes(owner) {
		if n["read_at"] == nil {
			t.Fatalf("a report notification is unread after the author was removed: %v", n)
		}
	}
}

// The owner and moderators see an image in an open report, even from a room they are not in, and the sweep keeps it
// while the report is open.
func TestReportedImages(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Knitting"})
	gid := room["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d %v", status, img)
	}
	url := img["url"].(string)
	body := `<img src="` + url + `" alt="" width="40" height="40" data-image-id="` + img["id"].(string) + `">`
	post := kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": body})
	owner.mustStatus(404, "GET", url, nil)
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": post["id"].(string)})
	owner.mustStatus(200, "GET", url, nil)
	kit.mustStatus(200, "DELETE", "/api/posts/"+post["id"].(string), nil)
	if n, err := images.Sweep(context.Background(), srv.q(), srv.Images, db.Now()+1); err != nil || n != 0 {
		t.Fatalf("sweep while the report is open: %d %v", n, err)
	}
	owner.mustStatus(200, "GET", url, nil)
	owner.mustStatus(204, "POST", "/api/reports/post/"+post["id"].(string)+"/dismiss", nil)
	owner.mustStatus(404, "GET", url, nil)
}

// A report is pushed to the owner's and moderators' devices, and opens the Community page.
func TestPushForReports(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	fake := &fakePush{gone: map[string]bool{}}
	srv.Push = &push.Pusher{DB: srv.DB, Send: fake}
	srv.PushKey = "test-public-key"
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "Thursday Group", "description": ""})
	owner.mustStatus(201, "POST", "/api/push/subscriptions", map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/owner-phone", "keys": map[string]string{"p256dh": "p", "auth": "a"}})
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	mo.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": post["id"].(string)})
	got := waitPushes(t, fake, 1)
	if want := "https://fcm.googleapis.com/fcm/send/owner-phone Thursday Group mo reported a post http://sweet.test/community"; got[0] != want {
		t.Fatalf("push:\n got %q\nwant %q", got[0], want)
	}
}
