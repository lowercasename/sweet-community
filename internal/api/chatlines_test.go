package api

import "testing"

// Joined and added lines in chat. Someone joining the
// community puts a joined line in the community's chat. Someone added to a
// room puts an added line in the room's chat, naming who added whom. A line has
// no body, cannot be deleted or replied to, and does not make the chat unread.
func TestChatLines(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	line := func(c *client, path, kind string) map[string]any {
		t.Helper()
		for _, x := range c.mustStatus(200, "GET", path+"/messages", nil)["messages"].([]any) {
			if m := x.(map[string]any); m["kind"] == kind {
				return m
			}
		}
		t.Fatalf("no %s line in %s: ", kind, path)
		return nil
	}
	joined := line(owner, rootPath, "joined")
	if joined["author"].(map[string]any)["id"] != kitID || joined["body_html"] != "" || joined["subject"] != nil {
		t.Fatalf("joined line: %v", joined)
	}
	if e, d := can(joined); e || d {
		t.Fatalf("the owner can edit or delete a joined line: %v", joined["can"])
	}
	owner.mustStatus(403, "DELETE", "/api/messages/"+joined["id"].(string), nil)

	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	rp := "/api/groups/" + room["id"].(string)
	owner.mustStatus(201, "POST", rp+"/members", map[string]string{"user_id": kitID})
	added := line(kit, rp, "added")
	if added["author"].(map[string]any)["username"] != "raphael" || added["subject"].(map[string]any)["id"] != kitID {
		t.Fatalf("added line: %v", added)
	}
	// A line is not a reply's original, and it leaves the chat read.
	kit.mustStatus(400, "POST", rp+"/messages", map[string]any{"body_html": "<p>hi</p>", "reply_to": added["id"]})
	for _, m := range kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
		if mm := m.(map[string]any); mm["stream"] == "chat:"+room["id"].(string) && mm["unread"] != 0.0 {
			t.Fatalf("an added line made the chat unread: %v", mm)
		}
	}
	// An ordinary message still has kind message.
	said := kit.mustStatus(201, "POST", rp+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	if said["kind"] != "message" {
		t.Fatalf("an ordinary message's kind: %v", said["kind"])
	}
}
