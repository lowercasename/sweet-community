package api

import (
	"testing"

	"sweet/internal/perm"
)

func TestPostMovesKeepDiscussionAndNotifications(t *testing.T) {
	ts, owner := newTestServer(t)
	writer, _ := registerMember(t, ts, owner, "writer")
	reader, _ := registerMember(t, ts, owner, "reader")
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Open", "visibility": "open"})
	gid := room["id"].(string)
	p := writer.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Original</p>"})
	path := "/api/posts/" + p["id"].(string)
	reader.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>A reply</p>"})
	before := notificationList(t, writer)[0]
	writer.mustStatus(200, "PUT", path+"/notifications", map[string]bool{"following": false})
	for _, dest := range []string{gid, perm.Root, gid} {
		moved := writer.mustStatus(200, "PUT", path, map[string]string{"body_html": "<p>Edited</p>", "group_id": dest})
		if moved["group_id"] != dest || moved["created_at"] != p["created_at"] || moved["comment_count"] != float64(1) {
			t.Fatalf("move lost the post or discussion: %v", moved)
		}
		if moved["can"].(map[string]any)["move"] != true {
			t.Fatal("author cannot move public post")
		}
		comments := reader.mustStatus(200, "GET", path+"/comments", nil)["comments"].([]any)
		if comments[0].(map[string]any)["group_id"] != dest {
			t.Fatal("reply kept old group")
		}
		n := notificationList(t, writer)[0]
		if n["id"] != before["id"] || n["group_id"] != dest || n["activity_count"] != before["activity_count"] || n["read_at"] != before["read_at"] {
			t.Fatal("notification changed activity or kept old group")
		}
		if writer.mustStatus(200, "GET", path+"/notifications", nil)["following"] != false {
			t.Fatal("move lost mute")
		}
		rows := reader.mustStatus(200, "GET", "/api/groups/"+gid+"/posts", nil)["posts"].([]any)
		if (len(rows) == 1) != (dest == gid) {
			t.Fatal("wrong room feed")
		}
		if len(reader.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)) != 1 {
			t.Fatal("Home lost or duplicated post")
		}
	}
	// Removing the original room must not delete the moved discussion or its notifications.
	writer.mustStatus(200, "PUT", path, map[string]string{"body_html": "<p>Edited</p>", "group_id": perm.Root})
	owner.mustStatus(200, "DELETE", "/api/groups/"+gid, nil)
	reader.mustStatus(200, "GET", path, nil)
	if len(notificationList(t, writer)) != 1 {
		t.Fatal("old room deletion removed moved notification")
	}
	for _, e := range writer.readEvents(100) {
		payload := e["payload"].(map[string]any)
		if payload["post_id"] == p["id"] && payload["group_id"] == gid {
			t.Fatal("replay kept old group")
		}
	}
}

func TestPostMoveBoundaries(t *testing.T) {
	ts, owner := newTestServer(t)
	writer, writerID := registerMember(t, ts, owner, "writer")
	private := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private", "visibility": "private"})["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+private+"/members", map[string]string{"user_id": writerID})
	public := writer.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Public</p>"})["id"].(string)
	secret := writer.mustStatus(201, "POST", "/api/groups/"+private+"/posts", map[string]string{"body_html": "<p>Secret</p>"})["id"].(string)
	room := writer.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Open", "visibility": "open"})["id"].(string)
	for _, pair := range [][2]string{{public, private}, {secret, perm.Root}, {secret, room}} {
		writer.mustStatus(403, "PUT", "/api/posts/"+pair[0], map[string]string{"body_html": "<p>Changed</p>", "group_id": pair[1]})
	}
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	dm := writer.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{ownerID}})["id"].(string)
	writer.mustStatus(403, "PUT", "/api/posts/"+public, map[string]string{"body_html": "<p>Changed</p>", "group_id": dm})
	owner.mustStatus(403, "PUT", "/api/posts/"+public, map[string]string{"body_html": "<p>Changed</p>", "group_id": room})
	writer.mustStatus(404, "PUT", "/api/posts/"+public, map[string]string{"body_html": "<p>Changed</p>", "group_id": "missing"})
	writer.mustStatus(200, "DELETE", "/api/groups/"+room, nil)
	writer.mustStatus(404, "PUT", "/api/posts/"+public, map[string]string{"body_html": "<p>Changed</p>", "group_id": room})
	unchanged := writer.mustStatus(200, "GET", "/api/posts/"+public, nil)
	if unchanged["body_html"] != "<p>Public</p>" {
		t.Fatal("failed move changed body")
	}
	edited := writer.mustStatus(200, "PUT", "/api/posts/"+secret, map[string]string{"body_html": "<p>Private edit</p>", "group_id": private})
	if edited["can"].(map[string]any)["move"] == true {
		t.Fatal("private post can move")
	}
}

func TestMovingReportedPostKeepsReportUsable(t *testing.T) {
	ts, owner := newTestServer(t)
	writer, _ := registerMember(t, ts, owner, "writer")
	reader, _ := registerMember(t, ts, owner, "reader")
	room := writer.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Open", "visibility": "open"})["id"].(string)
	p := writer.mustStatus(201, "POST", "/api/groups/"+room+"/posts", map[string]string{"body_html": "<p>Reported original</p>"})["id"].(string)
	reader.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": p, "reason": "Check this"})
	writer.mustStatus(200, "PUT", "/api/posts/"+p, map[string]string{"body_html": "<p>Edited</p>", "group_id": perm.Root})
	writer.mustStatus(200, "DELETE", "/api/groups/"+room, nil)
	reports := owner.mustStatus(200, "GET", "/api/reports", nil)["reports"].([]any)
	report := reports[0].(map[string]any)
	if report["deleted"] == true || report["group_id"] != perm.Root || report["body_html"] != "<p>Reported original</p>" {
		t.Fatalf("report lost its current location or original copy: %v", report)
	}
	owner.mustStatus(204, "POST", "/api/reports/post/"+p+"/delete", nil)
	writer.mustStatus(404, "GET", "/api/posts/"+p, nil)
}
