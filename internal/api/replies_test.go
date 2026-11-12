package api

import (
	"strings"
	"testing"

	"sweet/internal/push"
)

// Replies to chat messages. A message can reply to an
// earlier message in the same chat. The reply carries a snippet of the
// original, built by the server from the original row: its id, author and
// plain text, or only its id and deleted once the original is deleted. The
// original's author gets a reply notification in a room's chat, at most one
// even when the reply also mentions them. In a conversation the message
// notification already covers it.
func TestReplies(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	fake := &fakePush{gone: map[string]bool{}}
	srv.Push = &push.Pusher{DB: srv.DB, Send: fake}
	srv.PushKey = "test-public-key"
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "Thursday Group", "description": ""})
	kit.mustStatus(201, "POST", "/api/push/subscriptions", map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/kit-phone", "keys": map[string]string{"p256dh": "p", "auth": "a"}})
	notifications := func(c *client) []map[string]any {
		t.Helper()
		var out []map[string]any
		for _, x := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
			out = append(out, x.(map[string]any))
		}
		return out
	}

	original := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Who is bringing the projector?</p>"})
	oid := original["id"].(string)
	if original["reply_to"] != nil {
		t.Fatalf("a plain message has no reply_to: %v", original["reply_to"])
	}

	// Mo replies. The reply carries the original's id, author and text.
	reply := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>I am.</p>", "reply_to": oid})
	rt, _ := reply["reply_to"].(map[string]any)
	if rt == nil || rt["id"] != oid || rt["deleted"] != false || rt["text"] != "Who is bringing the projector?" || rt["author"].(map[string]any)["id"] != kitID {
		t.Fatalf("reply_to on the reply: %v", reply["reply_to"])
	}
	// The listed message carries the same snippet.
	var listed map[string]any
	for _, x := range kit.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if m := x.(map[string]any); m["id"] == reply["id"] {
			listed = m
		}
	}
	if listed == nil || listed["reply_to"].(map[string]any)["id"] != oid {
		t.Fatalf("listed reply: %v", listed)
	}

	// Kit is notified with the new kind, and the push says who replied. Mo is not notified of their own reply.
	ns := notifications(kit)
	if len(ns) != 1 || ns[0]["kind"] != "reply" || ns[0]["actor"].(map[string]any)["id"] != moID || ns[0]["message_id"] != reply["id"] {
		t.Fatalf("kit's notifications after the reply (it names the reply, so it can open at it): %v", ns)
	}
	if got := waitPushes(t, fake, 1); !strings.Contains(got[0], "kit-phone Thursday Group mo replied to your message http://sweet.test/") {
		t.Fatalf("push: %q", got[0])
	}
	if ns := notifications(mo); len(ns) != 1 || ns[0]["actor"].(map[string]any)["id"] != kitID {
		t.Fatalf("mo notified of their own reply: %v", notifications(mo))
	}

	// A reply that also mentions kit makes one notification, the mention.
	mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>" + mentionOf(kitID, "kit") + " and the cable</p>", "reply_to": oid})
	if ns = notifications(kit); len(ns) != 1 || ns[0]["kind"] != "mention" || ns[0]["activity_count"] != float64(2) {
		t.Fatalf("a reply that mentions kit: %v", ns)
	}

	// A mention in chat names its message too, so the notification can open the chat at it.
	said := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>" + mentionOf(kitID, "kit") + " look</p>"})
	if ns = notifications(kit); len(ns) != 1 || ns[0]["kind"] != "mention" || ns[0]["activity_count"] != float64(3) || ns[0]["message_id"] != said["id"] {
		t.Fatalf("a chat mention's notification: %v", ns)
	}

	// Replying to one's own message notifies nobody.
	kit.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>Thanks.</p>", "reply_to": oid})
	if len(notifications(kit)) != 1 {
		t.Fatalf("kit notified of their own reply: %v", notifications(kit))
	}

	// A reply must point at a live message in the same chat.
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	elsewhere := owner.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/messages", map[string]string{"body_html": "<p>wool</p>"})
	mo.mustStatus(400, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>x</p>", "reply_to": elsewhere["id"]})
	mo.mustStatus(400, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>x</p>", "reply_to": "not-a-message"})

	// Once the original is deleted, a reply shows only that it replied to a deleted message.
	kit.mustStatus(200, "DELETE", "/api/messages/"+oid, nil)
	for _, x := range mo.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		m := x.(map[string]any)
		if m["id"] != reply["id"] {
			continue
		}
		rt := m["reply_to"].(map[string]any)
		if rt["id"] != oid || rt["deleted"] != true || rt["text"] != "" || rt["author"] != nil {
			t.Fatalf("reply_to after the original was deleted: %v", rt)
		}
	}
	mo.mustStatus(400, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>x</p>", "reply_to": oid})

	// In a conversation the message notification covers a reply. Kit gets one message notification, no reply one.
	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	gid := dm["id"].(string)
	first := mo.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": first["created_at"]})
	before := len(notifications(mo))
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]any{"body_html": "<p>hi</p>", "reply_to": first["id"]})
	ms := notifications(mo)
	if len(ms) != before+1 || ms[0]["kind"] != "message" {
		t.Fatalf("mo's notifications after a reply in a conversation: %v", ms)
	}
}
