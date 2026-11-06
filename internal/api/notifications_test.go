package api

import (
	"reflect"
	"testing"
	"time"

	"sweet/internal/perm"
)

// Notifications (architecture.md, Notifications): one row per person per
// thing done to them, written in the same transaction as the thing, told to
// that person alone over the stream. Two kinds for now: a comment on your
// post, and being added to a room. Reading is a marker on the stream.
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

	// A comment on my post is mine to hear about; my own comment is not; the commenter hears nothing.
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
	if len(list(mo)) != 0 || len(list(owner)) != 0 {
		t.Fatalf("others notified: mo %v owner %v", list(mo), list(owner))
	}

	// Being added to a room: the added person hears, the adder does not.
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
	if len(list(owner)) != 0 {
		t.Fatalf("the adder was notified: %v", list(owner))
	}

	// The stream carries each to its person only, and what it carries is the row.
	if evs := events(kit, "notification"); len(evs) != 2 || !reflect.DeepEqual(evs[1], added) || !reflect.DeepEqual(evs[0], n) {
		t.Fatalf("kit's notification events: %v", evs)
	}
	if evs := events(mo, "notification"); len(evs) != 0 {
		t.Fatalf("mo's notification events: %v", evs)
	}

	// Pages: newest first, by created_at.
	page := kit.mustStatus(200, "GET", "/api/notifications?limit=1", nil)
	if len(page["notifications"].([]any)) != 1 || page["next_before"] == nil {
		t.Fatalf("first page: %v", page)
	}

	// Read markers: a row per stream of mine from the start (notifications, the root's chat, Knitting's chat),
	// unread counted; reading moves one forward, never backwards; told to me alone.
	if m := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any); len(m) != 5 {
		t.Fatalf("markers before reading: %v", m)
	}
	readAt := int64(added["created_at"].(float64))
	marker := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt})
	if marker["stream"] != "notifications" || marker["user_id"] != kitID || int64(marker["read_at"].(float64)) != readAt || marker["unread"] != float64(0) {
		t.Fatalf("marker: %v", marker)
	}
	back := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt - 1000})
	if int64(back["read_at"].(float64)) != readAt {
		t.Fatalf("marker moved backwards: %v", back)
	}
	var listed any
	for _, x := range kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
		if x.(map[string]any)["stream"] == "notifications" {
			listed = x
		}
	}
	if !reflect.DeepEqual(listed, marker) {
		t.Fatalf("listed marker: %v, reply: %v", listed, marker)
	}
	if evs := events(kit, "marker"); len(evs) != 2 || !reflect.DeepEqual(evs[1], marker) {
		t.Fatalf("kit's marker events: %v", evs)
	}
	if evs := events(mo, "marker"); len(evs) != 0 {
		t.Fatalf("mo hears kit's markers: %v", evs)
	}

	// A chat stream is a group I am in; one I am not in does not exist to me; anything else is nonsense.
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	mo.mustStatus(404, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/feed", map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/notifications", map[string]any{"read_at": 0})
	if m := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any); len(m) != 5 {
		t.Fatalf("markers after chat: %v", m)
	}

	// The future is not read: a marker ahead of now is held to now.
	ahead := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt + 1e12})
	if ahead["read_at"].(float64) >= float64(readAt)+1e12 {
		t.Fatalf("marker in the future: %v", ahead)
	}
}

// Chat unread (architecture.md, Notifications): a marker row for every room
// I am in, whether or not I have read anything, carrying how many messages
// by others are newer than where I have read to. Joining counts from the
// join: history is not unread. My own words are not unread either.
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

	// Every stream of mine has a row, read or not: notifications, the root's chat and its feed, unread 0.
	ms := markers(kit)
	if len(ms) != 3 || ms["notifications"]["unread"] != float64(0) || ms[rootChat]["unread"] != float64(0) || ms[rootChat]["user_id"] != kitID || ms["feed:"+perm.Root]["unread"] != float64(0) {
		t.Fatalf("kit's markers to begin with: %v", ms)
	}

	// Others' messages count; mine do not.
	mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>one</p>"})
	second := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>two</p>"})
	kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>mine</p>"})
	if n := unread(kit, rootChat); n != 2 {
		t.Fatalf("kit's unread in the root chat: %v", n)
	}
	if n := unread(mo, rootChat); n != 1 {
		t.Fatalf("mo's unread (kit's message): %v", n)
	}

	// Reading up to the second message leaves none; the reply is the row as GET lists it, and the event the same.
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

	// A room with history: joining counts from the join.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := room["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>old</p>"})
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": kitID})
	if n := unread(kit, "chat:"+gid); n != 0 {
		t.Fatalf("history counted as unread: %v", n)
	}
	time.Sleep(2 * time.Millisecond) // times are milliseconds; a message in the join's own millisecond is not after it
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>new</p>"})
	if n := unread(kit, "chat:"+gid); n != 1 {
		t.Fatalf("a new message in the room: %v", n)
	}
	// Notifications unread counts the same way: being added was one.
	if n := unread(kit, "notifications"); n != 1 {
		t.Fatalf("notifications unread: %v", n)
	}
	// The feed has a marker of its own, counted the same way: others' live posts since my marker or my joining; an edit is not new.
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

	// Leaving the room takes its markers with it.
	kit.mustStatus(204, "DELETE", "/api/groups/"+gid+"/members/"+kitID, nil)
	if _, ok := markers(kit)["chat:"+gid]; ok {
		t.Fatalf("a marker for a room I left: %v", markers(kit))
	}
	if _, ok := markers(kit)["feed:"+gid]; ok {
		t.Fatalf("a feed marker for a room I left: %v", markers(kit))
	}
}
