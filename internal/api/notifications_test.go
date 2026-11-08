package api

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/push"
)

// Notifications (architecture.md, Notifications). There is one row per user
// per action that affects them. The row is written in the same transaction
// as the action and sent over the stream to that user only. This test covers
// two kinds, a comment on the user's post and being added to a room. A
// notification is marked read when the user opens it.
func TestNotifications(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	list := func(c *client) []any {
		t.Helper()
		return c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any)
	}
	events := func(c *client, kind string) []map[string]any {
		t.Helper()
		var out []map[string]any
		for _, e := range c.readEvents(80) {
			if e["kind"] == kind {
				out = append(out, e["payload"].(map[string]any))
			}
		}
		return out
	}

	// A comment on a user's post notifies that user. Their own comment does not. The commenter is not notified.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	kit.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>me too</p>"})
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>hi</p>"})
	got := list(kit)
	if len(got) != 1 {
		t.Fatalf("kit's notifications: %v", got)
	}
	n := got[0].(map[string]any)
	if n["kind"] != "comment" || n["post_id"] != pid || n["group_id"] != perm.Root || n["user_id"] != kitID || n["actor"].(map[string]any)["id"] != moID {
		t.Fatalf("comment notification: %v", n)
	}
	// The owner's two notifications are for kit and mo joining (TestOwnerHearsOfEachArrival). None is for the comment.
	if len(list(mo)) != 0 || len(list(owner)) != 2 || list(owner)[0].(map[string]any)["kind"] != NotifyJoined {
		t.Fatalf("others notified: mo %v owner %v", list(mo), list(owner))
	}

	// When a user is added to a room, the added user is notified and the user who added them is not.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := room["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": kitID})
	got = list(kit)
	if len(got) != 2 {
		t.Fatalf("kit's notifications after being added: %v", got)
	}
	added := got[0].(map[string]any) // newest first
	if added["kind"] != "added" || added["group_id"] != gid || added["actor"].(map[string]any)["username"] != "raphael" || added["post_id"] != nil {
		t.Fatalf("added notification: %v", added)
	}
	if l := list(owner); len(l) != 2 || l[0].(map[string]any)["kind"] != NotifyJoined {
		t.Fatalf("the adder was notified of adding (beyond the two arrivals): %v", l)
	}

	// The stream sends each notification to its user only, and the event payload equals the row.
	if evs := events(kit, "notification"); len(evs) != 2 || !reflect.DeepEqual(evs[1], added) || !reflect.DeepEqual(evs[0], n) {
		t.Fatalf("kit's notification events: %v", evs)
	}
	if evs := events(mo, "notification"); len(evs) != 0 {
		t.Fatalf("mo's notification events: %v", evs)
	}

	// Pages are ordered newest first by created_at.
	page := kit.mustStatus(200, "GET", "/api/notifications?limit=1", nil)
	if len(page["notifications"].([]any)) != 1 || page["next_before"] == nil {
		t.Fatalf("first page: %v", page)
	}

	// A notification is read by opening it, one at a time. The row gets read_at, and the event payload equals the row. Mo cannot mark kit's notification read.
	if n["read_at"] != nil || added["read_at"] != nil {
		t.Fatalf("new notifications are unread: %v %v", n, added)
	}
	mo.mustStatus(404, "PUT", "/api/notifications/"+n["id"].(string)+"/read", nil)
	read := kit.mustStatus(200, "PUT", "/api/notifications/"+n["id"].(string)+"/read", nil)
	if read["read_at"] == nil || read["id"] != n["id"] {
		t.Fatalf("read reply: %v", read)
	}
	again := kit.mustStatus(200, "PUT", "/api/notifications/"+n["id"].(string)+"/read", nil)
	if !reflect.DeepEqual(again, read) {
		t.Fatalf("a second opening moved read_at: %v vs %v", again, read)
	}
	if evs := events(kit, "notification"); len(evs) == 0 || !reflect.DeepEqual(evs[len(evs)-1], read) {
		t.Fatalf("the read event is not the row: %v", evs)
	}
	markers := func(c *client) map[string]map[string]any {
		out := map[string]map[string]any{}
		for _, x := range c.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
			m := x.(map[string]any)
			out[m["stream"].(string)] = m
		}
		return out
	}
	if u := markers(kit)["notifications"]["unread"]; u != float64(1) {
		t.Fatalf("unread after opening one of two: %v", u)
	}
	// A marker cannot be set on the notifications stream. Opening the notifications page does not mark anything read.
	kit.mustStatus(400, "PUT", "/api/markers/notifications", map[string]any{"read_at": int64(n["created_at"].(float64))})

	// Clearing permanently deletes the read notifications, and the event is sent to this user only. The unread one stays.
	cleared := kit.mustStatus(200, "DELETE", "/api/notifications", nil)
	if cleared["user_id"] != kitID || cleared["before"] == nil {
		t.Fatalf("cleared: %v", cleared)
	}
	if left := list(kit); len(left) != 1 || left[0].(map[string]any)["id"] != added["id"] {
		t.Fatalf("after clearing the opened one: %v", left)
	}
	if evs := events(kit, "notification_delete"); len(evs) != 1 || !reflect.DeepEqual(evs[0], cleared) {
		t.Fatalf("kit's clear events: %v", evs)
	}
	if evs := events(mo, "notification_delete"); len(evs) != 0 {
		t.Fatalf("mo hears kit's clearing: %v", evs)
	}

	// Read markers. Each of the user's streams has a row from the start. These are notifications (with its unread
	// count), the root group's chat and feed, and Knitting's chat and feed. A chat marker only moves forward. Marker
	// events are sent to this user only.
	if m := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any); len(m) != 5 {
		t.Fatalf("markers: %v", m)
	}
	readAt := int64(added["created_at"].(float64))
	marker := kit.mustStatus(200, "PUT", "/api/markers/chat:"+perm.Root, map[string]any{"read_at": readAt})
	if marker["stream"] != "chat:"+perm.Root || marker["user_id"] != kitID || int64(marker["read_at"].(float64)) != readAt || marker["unread"] != float64(0) {
		t.Fatalf("marker: %v", marker)
	}
	back := kit.mustStatus(200, "PUT", "/api/markers/chat:"+perm.Root, map[string]any{"read_at": readAt - 1000})
	if int64(back["read_at"].(float64)) != readAt {
		t.Fatalf("marker moved backwards: %v", back)
	}
	if !reflect.DeepEqual(markers(kit)["chat:"+perm.Root], marker) {
		t.Fatalf("listed marker: %v, reply: %v", markers(kit)["chat:"+perm.Root], marker)
	}
	if evs := events(kit, "marker"); len(evs) == 0 || !reflect.DeepEqual(evs[len(evs)-1], marker) {
		t.Fatalf("kit's marker events: %v", evs)
	}
	if evs := events(mo, "marker"); len(evs) != 0 {
		t.Fatalf("mo hears kit's markers: %v", evs)
	}

	// A chat stream must be a group the user is in. A group the user is not in returns 404. Any other stream name returns 400.
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	mo.mustStatus(404, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/nonsense", map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": 0})

	// A marker cannot be set in the future. A read_at after the current time is capped at the current time.
	ahead := kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt + 1e12})
	if ahead["read_at"].(float64) >= float64(readAt)+1e12 {
		t.Fatalf("marker in the future: %v", ahead)
	}
}

// Chat unread counts (architecture.md, Notifications). There is a marker row
// for every room the user is in, whether or not they have read anything. It
// includes the number of other users' messages newer than the user's read
// position. After a join, the count starts from the join time, so earlier
// history is not unread. The user's own messages are not unread either.
func TestChatUnread(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")

	markers := func(c *client) map[string]map[string]any {
		t.Helper()
		out := map[string]map[string]any{}
		for _, x := range c.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
			m := x.(map[string]any)
			out[m["stream"].(string)] = m
		}
		return out
	}
	unread := func(c *client, stream string) float64 {
		t.Helper()
		m, ok := markers(c)[stream]
		if !ok {
			t.Fatalf("no marker for %s: %v", stream, markers(c))
		}
		return m["unread"].(float64)
	}
	rootChat := "chat:" + perm.Root

	// Each of the user's streams has a row, read or not. These are notifications and the root group's chat and feed, each with unread 0.
	ms := markers(kit)
	if len(ms) != 3 || ms["notifications"]["unread"] != float64(0) || ms[rootChat]["unread"] != float64(0) || ms[rootChat]["user_id"] != kitID || ms["feed:"+perm.Root]["unread"] != float64(0) {
		t.Fatalf("kit's markers to begin with: %v", ms)
	}

	// Other users' messages are counted. The user's own messages are not.
	mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>one</p>"})
	second := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>two</p>"})
	kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>mine</p>"})
	if n := unread(kit, rootChat); n != 2 {
		t.Fatalf("kit's unread in the root chat: %v", n)
	}
	if n := unread(mo, rootChat); n != 1 {
		t.Fatalf("mo's unread (kit's message): %v", n)
	}

	// Reading up to the second message leaves no unread messages. The response equals the row that GET lists, and so does the event.
	readAt := int64(second["created_at"].(float64))
	marker := kit.mustStatus(200, "PUT", "/api/markers/"+rootChat, map[string]any{"read_at": readAt})
	if marker["unread"] != float64(0) || int64(marker["read_at"].(float64)) != readAt {
		t.Fatalf("marker after reading: %v", marker)
	}
	if !reflect.DeepEqual(markers(kit)[rootChat], marker) {
		t.Fatalf("listed marker differs from the reply\nlisted: %v\nreply:  %v", markers(kit)[rootChat], marker)
	}
	var fromStream map[string]any
	for _, e := range kit.readEvents(80) {
		if e["kind"] == "marker" {
			fromStream = e["payload"].(map[string]any)
		}
	}
	if !reflect.DeepEqual(fromStream, marker) {
		t.Fatalf("marker event differs from the reply\nevent: %v\nreply: %v", fromStream, marker)
	}
	// A deleted message is not unread.
	third := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>three</p>"})
	if n := unread(kit, rootChat); n != 1 {
		t.Fatalf("after a third message: %v", n)
	}
	mo.mustStatus(200, "DELETE", "/api/messages/"+third["id"].(string), nil)
	if n := unread(kit, rootChat); n != 0 {
		t.Fatalf("after deleting it: %v", n)
	}

	// In a room with history, the unread count starts from the join.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := room["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>old</p>"})
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": kitID})
	if n := unread(kit, "chat:"+gid); n != 0 {
		t.Fatalf("history counted as unread: %v", n)
	}
	time.Sleep(2 * time.Millisecond) // times are in milliseconds, and a message in the same millisecond as the join is not after it
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>new</p>"})
	if n := unread(kit, "chat:"+gid); n != 1 {
		t.Fatalf("a new message in the room: %v", n)
	}
	// The notifications unread count works the same way. Being added to the room is one unread notification.
	if n := unread(kit, "notifications"); n != 1 {
		t.Fatalf("notifications unread: %v", n)
	}
	// The feed has its own marker, counted the same way. It counts other users' posts that are not deleted, since the user's marker or join time. An edit is not a new post.
	if n := unread(kit, "feed:"+gid); n != 0 {
		t.Fatalf("history posts counted as unread: %v", n)
	}
	post := owner.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>wool</p>"})
	owner.mustStatus(200, "PUT", "/api/posts/"+post["id"].(string), map[string]string{"body_html": "<p>wool!</p>"})
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>mine</p>"})
	if n := unread(kit, "feed:"+gid); n != 1 {
		t.Fatalf("feed unread: %v", n)
	}
	read := kit.mustStatus(200, "PUT", "/api/markers/feed:"+gid, map[string]any{"read_at": int64(post["created_at"].(float64))})
	if read["unread"] != float64(0) || !reflect.DeepEqual(markers(kit)["feed:"+gid], read) {
		t.Fatalf("feed marker after reading: %v listed %v", read, markers(kit)["feed:"+gid])
	}
	mo.mustStatus(404, "PUT", "/api/markers/feed:"+gid, map[string]any{"read_at": readAt})

	// Leaving the room deletes its markers.
	kit.mustStatus(204, "DELETE", "/api/groups/"+gid+"/members/"+kitID, nil)
	if _, ok := markers(kit)["chat:"+gid]; ok {
		t.Fatalf("a marker for a room I left: %v", markers(kit))
	}
	if _, ok := markers(kit)["feed:"+gid]; ok {
		t.Fatalf("a feed marker for a room I left: %v", markers(kit))
	}
}

// A user's own settings (architecture.md, Notifications). The digest is weekly until the user turns it off.
func TestMySettings(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	if got := kit.mustStatus(200, "GET", "/api/me/settings", nil); got["digest"] != "weekly" {
		t.Fatalf("default: %v", got)
	}
	kit.mustStatus(400, "PUT", "/api/me/settings", map[string]string{"digest": "never"})
	if got := kit.mustStatus(200, "PUT", "/api/me/settings", map[string]string{"digest": "off"}); got["digest"] != "off" {
		t.Fatalf("set: %v", got)
	}
	if got := kit.mustStatus(200, "GET", "/api/me/settings", nil); got["digest"] != "off" {
		t.Fatalf("kept: %v", got)
	}
	// The setting applies to this user only.
	if got := owner.mustStatus(200, "GET", "/api/me/settings", nil); got["digest"] != "weekly" {
		t.Fatalf("someone else's: %v", got)
	}
}

// fakePush is a push sender that records what it sends. A test can mark a
// device's endpoint as gone.
type fakePush struct {
	mu   sync.Mutex
	sent []string // "endpoint title body url [tag]"
	gone map[string]bool
}

func (f *fakePush) Send(_ context.Context, sub push.Subscription, data []byte) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.gone[sub.Endpoint] {
		return true, nil
	}
	var p push.Payload
	_ = json.Unmarshal(data, &p)
	f.sent = append(f.sent, strings.TrimSpace(sub.Endpoint+" "+p.Title+" "+p.Body+" "+p.URL+" "+p.Tag))
	return false, nil
}

func (f *fakePush) all() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.sent...)
}

// Web push (architecture.md, Notifications). A mention, or a comment on the
// user's post, is pushed to each device the user subscribed. Nothing else is
// pushed. A device that the push service reports as gone is removed.
func TestPushForMentionsAndReplies(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	fake := &fakePush{gone: map[string]bool{}}
	srv.Push = &push.Pusher{DB: srv.DB, Send: fake}
	srv.PushKey = "test-public-key"
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "Thursday Group", "description": ""})

	if got := kit.mustStatus(200, "GET", "/api/push/key", nil); got["key"] != "test-public-key" {
		t.Fatalf("key: %v", got)
	}
	sub := func(endpoint string) map[string]any {
		return map[string]any{"endpoint": endpoint, "keys": map[string]string{"p256dh": "p", "auth": "a"}}
	}
	kit.mustStatus(400, "POST", "/api/push/subscriptions", sub("http://insecure.test/x"))
	// Only a browser's push service is accepted, so a user cannot make the server send requests to other hosts.
	kit.mustStatus(400, "POST", "/api/push/subscriptions", sub("https://192.168.1.1/admin"))
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://fcm.googleapis.com/fcm/send/kit-phone"))
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://fcm.googleapis.com/fcm/send/kit-laptop"))
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://fcm.googleapis.com/fcm/send/kit-phone")) // the same device again is stored once

	wait := func(n int) []string {
		t.Helper()
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			if got := fake.all(); len(got) >= n {
				return got
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatalf("waited for %d pushes, got %v", n, fake.all())
		return nil
	}

	// A comment on kit's post is pushed to both of kit's devices, with the text and the post's URL. It is not pushed to mo or the owner.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>hi</p>"})
	got := wait(2)
	for _, s := range got {
		if !strings.HasPrefix(s, "https://fcm.googleapis.com/fcm/send/kit-") || !strings.Contains(s, " Thursday Group mo commented on your post http://sweet.test/p/"+pid) {
			t.Fatalf("push: %q", s)
		}
	}
	// Being added to a room is a notification but not a push.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	owner.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/members", map[string]string{"user_id": kitID})
	time.Sleep(150 * time.Millisecond)
	if len(fake.all()) != 2 {
		t.Fatalf("pushed for an add: %v", fake.all())
	}
	// A mention is pushed. The push service now reports the phone as gone, so it is removed. Only the laptop receives the next push.
	fake.gone["https://fcm.googleapis.com/fcm/send/kit-phone"] = true
	mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>" + mentionOf(kitID, "kit") + " look</p>"})
	got = wait(3)
	if !strings.Contains(got[2], "kit-laptop Thursday Group mo mentioned you http://sweet.test/p/") {
		t.Fatalf("mention push: %q", got[2])
	}
	time.Sleep(100 * time.Millisecond)
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>again</p>"})
	got = wait(4)
	if len(got) != 4 || !strings.HasPrefix(got[3], "https://fcm.googleapis.com/fcm/send/kit-laptop") {
		t.Fatalf("after the phone went: %v", got)
	}
	// Kit removes the laptop subscription, so no more pushes are sent.
	kit.mustStatus(200, "DELETE", "/api/push/subscriptions", map[string]string{"endpoint": "https://fcm.googleapis.com/fcm/send/kit-laptop"})
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>once more</p>"})
	time.Sleep(150 * time.Millisecond)
	if len(fake.all()) != 4 {
		t.Fatalf("pushed to a dropped device: %v", fake.all())
	}
}

// mentionOf returns the stored HTML of a mention of a user, as the editor writes it.
func mentionOf(id, name string) string {
	return fmt.Sprintf(`<span data-type="mention" data-mention-id="%s">@%s</span>`, id, name)
}

// waitPushes returns the fake's record once it has n pushes. It fails the test after a timeout.
func waitPushes(t *testing.T, fake *fakePush, n int) []string {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if got := fake.all(); len(got) >= n {
			return got
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("waited for %d pushes, got %v", n, fake.all())
	return nil
}

// A message in a conversation creates a notification (architecture.md,
// Notifications, 2026-11-08). There is at most one unread row per
// conversation. It is marked read either by opening it from the
// notifications page or by reading the conversation. A message in a room's
// chat creates no notification.
func TestMessageNotifications(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	dm := mo.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID}})
	gid := dm["id"].(string)
	list := func(c *client) []map[string]any {
		t.Helper()
		var out []map[string]any
		for _, x := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
			out = append(out, x.(map[string]any))
		}
		return out
	}
	unreadBell := func(c *client) float64 {
		t.Helper()
		for _, x := range c.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
			if m := x.(map[string]any); m["stream"] == "notifications" {
				return m["unread"].(float64)
			}
		}
		t.Fatal("no notifications marker")
		return 0
	}

	// One message creates one unread row for kit, from mo, with the conversation's group id and no post. Mo has no notifications.
	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>one</p>"})
	ns := list(kit)
	if len(ns) != 1 || ns[0]["kind"] != "message" || ns[0]["actor"].(map[string]any)["id"] != moID || ns[0]["group_id"] != gid || ns[0]["post_id"] != nil || ns[0]["read_at"] != nil {
		t.Fatalf("kit's notifications after a message: %v", ns)
	}
	if len(list(mo)) != 0 {
		t.Fatalf("mo told of mo's own message: %v", list(mo))
	}
	// A second message while the first row is unread writes no second row.
	second := mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>two</p>"})
	if ns = list(kit); len(ns) != 1 || unreadBell(kit) != 1 {
		t.Fatalf("a second row for the same conversation: %v (bell %v)", ns, unreadBell(kit))
	}
	// Moving the chat marker marks the row read. The PUT returns the marker, and the updated
	// row is sent as a notification event so every client updates.
	readAt := int64(second["created_at"].(float64))
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	if ns = list(kit); len(ns) != 1 || ns[0]["read_at"] == nil || unreadBell(kit) != 0 {
		t.Fatalf("after reading the conversation: %v (bell %v)", ns, unreadBell(kit))
	}
	// The notifications stream's unread count is sent after the row, for clients that have not loaded the list.
	var told, counted bool
	for _, e := range kit.readEvents(80) {
		p, _ := e["payload"].(map[string]any)
		switch {
		case e["kind"] == "notification" && p["id"] == ns[0]["id"] && p["read_at"] != nil:
			told = true
		case e["kind"] == "marker" && p["stream"] == "notifications":
			if !told || p["unread"] != float64(0) {
				t.Fatalf("notifications marker before the row, or wrong: %v (row seen %v)", p, told)
			}
			counted = true
		}
	}
	if !told || !counted {
		t.Fatalf("the read row and the bell's count did not both go out (row %v, count %v)", told, counted)
	}
	// The next message creates a new row, and kit's reply creates one for mo.
	time.Sleep(2 * time.Millisecond)
	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>three</p>"})
	if ns = list(kit); len(ns) != 2 || ns[0]["read_at"] != nil || ns[1]["read_at"] == nil {
		t.Fatalf("after a message once read: %v", ns)
	}
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>back</p>"})
	if ms := list(mo); len(ms) != 1 || ms[0]["kind"] != "message" || ms[0]["actor"].(map[string]any)["id"] != kitID {
		t.Fatalf("mo's notifications after kit's reply: %v", ms)
	}
	// Opening the row from the notifications page also marks it read. A later marker update finds nothing to mark.
	mo.mustStatus(200, "PUT", "/api/notifications/"+list(mo)[0]["id"].(string)+"/read", nil)
	mo.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": db.Now()})
	if ms := list(mo); len(ms) != 1 || ms[0]["read_at"] == nil || unreadBell(mo) != 0 {
		t.Fatalf("after the bell door: %v", ms)
	}
	// A room's chat creates no notification. Kit is notified of being added to the room, not of the message.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	rid := room["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+rid+"/members", map[string]string{"user_id": kitID})
	owner.mustStatus(201, "POST", "/api/groups/"+rid+"/messages", map[string]string{"body_html": "<p>wool</p>"})
	for _, n := range list(kit) {
		if n["kind"] == "message" && n["group_id"] == rid {
			t.Fatalf("a room's message became a notification: %v", n)
		}
	}
	if ns = list(kit); len(ns) != 3 || ns[0]["kind"] != "added" {
		t.Fatalf("kit's notifications after the room: %v", ns)
	}
}

// A message in a conversation sends a push, once per unread notification row,
// tagged by conversation so a device shows one notification per conversation.
func TestPushForMessages(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	fake := &fakePush{gone: map[string]bool{}}
	srv.Push = &push.Pusher{DB: srv.DB, Send: fake}
	srv.PushKey = "test-public-key"
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "Thursday Group", "description": ""})
	kit.mustStatus(201, "POST", "/api/push/subscriptions", map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/kit-phone", "keys": map[string]string{"p256dh": "p", "auth": "a"}})
	dm := mo.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID}})
	gid := dm["id"].(string)

	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	got := waitPushes(t, fake, 1)
	if want := "https://fcm.googleapis.com/fcm/send/kit-phone Thursday Group mo messaged you http://sweet.test/r/" + gid + " chat:" + gid; got[0] != want {
		t.Fatalf("push:\n got %q\nwant %q", got[0], want)
	}
	// A second message while the first row is unread sends no second push, because no second row is written.
	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>still there?</p>"})
	time.Sleep(150 * time.Millisecond)
	if len(fake.all()) != 1 {
		t.Fatalf("pushed again for an unopened conversation: %v", fake.all())
	}
	// After kit reads the conversation, the next message creates a new row and a new push.
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": db.Now()})
	time.Sleep(2 * time.Millisecond)
	mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>yes</p>"})
	if got = waitPushes(t, fake, 2); !strings.HasSuffix(got[1], " chat:"+gid) {
		t.Fatalf("second push: %q", got[1])
	}
	// A message in a room's chat sends no push.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	owner.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/members", map[string]string{"user_id": kitID})
	owner.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/messages", map[string]string{"body_html": "<p>wool</p>"})
	time.Sleep(150 * time.Millisecond)
	if len(fake.all()) != 2 {
		t.Fatalf("pushed for a room's message: %v", fake.all())
	}
}
