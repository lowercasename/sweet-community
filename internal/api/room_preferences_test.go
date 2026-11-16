package api

import (
	"fmt"
	"testing"
)

func TestChatPreferencesFilterNewNotificationsButKeepUnreadContent(t *testing.T) {
	ts, owner := newTestServer(t)
	reader, uid := registerMember(t, ts, owner, "reader")
	if mode := reader.mustStatus(200, "GET", rootPath+"/notifications", nil)["mode"]; mode != "all" {
		t.Fatalf("Home default: %v", mode)
	}
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>First</p>"})
	reader.mustStatus(200, "PUT", rootPath+"/notifications", map[string]string{"mode": "mentions"})
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Quiet</p>"})
	ns := notificationList(t, reader)
	if len(ns) != 1 || ns[0]["activity_count"] != float64(1) {
		t.Fatalf("ordinary message notified: %v", ns)
	}
	mention := fmt.Sprintf(`<p><span data-type="mention" data-mention-id="%s">@reader</span></p>`, uid)
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": mention})
	reader.mustStatus(200, "PUT", rootPath+"/notifications", map[string]string{"mode": "off"})
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": mention})
	ns = notificationList(t, reader)
	if len(ns) != 1 || ns[0]["activity_count"] != float64(2) {
		t.Fatalf("Off changed notification history: %v", ns)
	}
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Room", "visibility": "open"})
	gid := room["id"].(string)
	if mode := reader.mustStatus(200, "GET", "/api/groups/"+gid+"/notifications", nil)["mode"]; mode != "mentions" {
		t.Fatalf("room default: %v", mode)
	}
	for _, raw := range reader.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
		m := raw.(map[string]any)
		if m["stream"] == "chat:"+rootPath[len("/api/groups/"):] && m["unread"] != float64(4) {
			t.Fatalf("chat unread: %v", m)
		}
	}
}

func TestRoomSidebarDoesNotChangeAccessOrNotifications(t *testing.T) {
	ts, owner := newTestServer(t)
	reader, uid := registerMember(t, ts, owner, "reader")
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Room", "visibility": "open"})
	gid := room["id"].(string)
	check := func(want bool) {
		t.Helper()
		for _, raw := range reader.mustStatus(200, "GET", "/api/me/room-sidebar", nil)["rooms"].([]any) {
			row := raw.(map[string]any)
			if row["group_id"] == gid {
				if row["in_sidebar"] != want {
					t.Fatalf("sidebar: %v", row)
				}
				return
			}
		}
		t.Fatal("missing accessible room")
	}
	check(false)
	reader.mustStatus(200, "PUT", "/api/groups/"+gid+"/sidebar", map[string]bool{"in_sidebar": true})
	check(true)
	reader.mustStatus(200, "PUT", "/api/groups/"+gid+"/sidebar", map[string]bool{"in_sidebar": false})
	check(false)
	for _, e := range owner.readEvents(30) {
		if e["kind"] == "room_sidebar" {
			t.Fatal("another user received the sidebar preference")
		}
	}
	reader.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>Still allowed</p>"})
	if mode := reader.mustStatus(200, "GET", "/api/groups/"+gid+"/notifications", nil)["mode"]; mode != "mentions" {
		t.Fatalf("shortcut changed notifications: %v", mode)
	}
	private := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"name": "Private", "visibility": "private", "members": []string{uid}})
	pid := private["id"].(string)
	reader.mustStatus(200, "PUT", "/api/groups/"+pid+"/sidebar", map[string]bool{"in_sidebar": false})
	reader.mustStatus(200, "GET", "/api/groups/"+pid, nil)
	owner.mustStatus(204, "DELETE", "/api/groups/"+pid+"/members/"+uid, nil)
	reader.mustStatus(404, "PUT", "/api/groups/"+pid+"/sidebar", map[string]bool{"in_sidebar": true})
}
