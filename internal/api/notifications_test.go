package api

import (
	"reflect"
	"testing"

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

	// Read markers: none to begin with; one per stream; never backwards; told to me alone.
	if m := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any); len(m) != 0 {
		t.Fatalf("markers before reading: %v", m)
	}
	readAt := int64(added["created_at"].(float64))
	marker := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt})
	if marker["stream"] != "notifications" || marker["user_id"] != kitID || int64(marker["read_at"].(float64)) != readAt {
		t.Fatalf("marker: %v", marker)
	}
	back := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt - 1000})
	if int64(back["read_at"].(float64)) != readAt {
		t.Fatalf("marker moved backwards: %v", back)
	}
	listed := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any)
	if len(listed) != 1 || !reflect.DeepEqual(listed[0], marker) {
		t.Fatalf("markers: %v", listed)
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
	if m := kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any); len(m) != 2 {
		t.Fatalf("markers after chat: %v", m)
	}

	// The future is not read: a marker ahead of now is held to now.
	ahead := kit.mustStatus(200, "PUT", "/api/markers/notifications", map[string]any{"read_at": readAt + 1e12})
	if ahead["read_at"].(float64) >= float64(readAt)+1e12 {
		t.Fatalf("marker in the future: %v", ahead)
	}
}
