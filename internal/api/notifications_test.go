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

	"sweet/internal/perm"
	"sweet/internal/push"
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
	// The owner's two are the arrivals of kit and mo (TestOwnerHearsOfEachArrival), nothing of the comment.
	if len(list(mo)) != 0 || len(list(owner)) != 2 || list(owner)[0].(map[string]any)["kind"] != NotifyJoined {
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
	if l := list(owner); len(l) != 2 || l[0].(map[string]any)["kind"] != NotifyJoined {
		t.Fatalf("the adder was notified of adding (beyond the two arrivals): %v", l)
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

	// Reading is by opening, one at a time: the row gets read_at, the event is the row, mo cannot read kit's.
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
	// The notifications stream takes no marker; the page alone reads nothing.
	kit.mustStatus(400, "PUT", "/api/markers/notifications", map[string]any{"read_at": int64(n["created_at"].(float64))})

	// Clearing: the opened ones go for good, told to me alone; the unread one stays.
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

	// Read markers: a row per stream of mine from the start (notifications with its unread, the root's chat and
	// feed, Knitting's chat and feed); a chat marker moves forward, never backwards; told to me alone.
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

	// A chat stream is a group I am in; one I am not in does not exist to me; anything else is nonsense.
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	mo.mustStatus(404, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/nonsense", map[string]any{"read_at": readAt})
	kit.mustStatus(400, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": 0})

	// The future is not read: a marker ahead of now is held to now.
	ahead := kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": readAt + 1e12})
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

// A person's own settings (architecture.md, Notifications): the digest is weekly until they turn it off.
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
	// Mine alone.
	if got := owner.mustStatus(200, "GET", "/api/me/settings", nil); got["digest"] != "weekly" {
		t.Fatalf("someone else's: %v", got)
	}
}

// A sender that remembers, and can be told a device is gone.
type fakePush struct {
	mu   sync.Mutex
	sent []string // "endpoint body url"
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
	f.sent = append(f.sent, sub.Endpoint+" "+p.Title+" "+p.Body+" "+p.URL)
	return false, nil
}

func (f *fakePush) all() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.sent...)
}

// Web push (architecture.md, Notifications): a mention or a comment on your
// post reaches each device you asked to be notified on, nothing else does,
// and a device the push service has lost is dropped.
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
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://push.test/kit-phone"))
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://push.test/kit-laptop"))
	kit.mustStatus(201, "POST", "/api/push/subscriptions", sub("https://push.test/kit-phone")) // again: the same device, once

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

	// A comment on kit's post: both of kit's devices, with the words and the post's address. Not mo, not the owner.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>hi</p>"})
	got := wait(2)
	for _, s := range got {
		if !strings.HasPrefix(s, "https://push.test/kit-") || !strings.Contains(s, " Thursday Group mo commented on your post http://sweet.test/p/"+pid) {
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
	// A mention pushes. The phone is gone now: the push service says so, and it is dropped, so the laptop alone hears next time.
	fake.gone["https://push.test/kit-phone"] = true
	mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>" + mentionOf(kitID, "kit") + " look</p>"})
	got = wait(3)
	if !strings.Contains(got[2], "kit-laptop Thursday Group mo mentioned you http://sweet.test/p/") {
		t.Fatalf("mention push: %q", got[2])
	}
	time.Sleep(100 * time.Millisecond)
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>again</p>"})
	got = wait(4)
	if len(got) != 4 || !strings.HasPrefix(got[3], "https://push.test/kit-laptop") {
		t.Fatalf("after the phone went: %v", got)
	}
	// Kit drops the laptop: silence.
	kit.mustStatus(200, "DELETE", "/api/push/subscriptions", map[string]string{"endpoint": "https://push.test/kit-laptop"})
	mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>once more</p>"})
	time.Sleep(150 * time.Millisecond)
	if len(fake.all()) != 4 {
		t.Fatalf("pushed to a dropped device: %v", fake.all())
	}
}

// mentionOf is a stored mention of a person, as the editor writes it.
func mentionOf(id, name string) string {
	return fmt.Sprintf(`<span data-type="mention" data-mention-id="%s">@%s</span>`, id, name)
}
