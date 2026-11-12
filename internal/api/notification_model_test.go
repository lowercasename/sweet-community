package api

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/push"
	"sweet/internal/store"
)

func notificationList(t *testing.T, c *client) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, n := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
		out = append(out, n.(map[string]any))
	}
	return out
}

func TestDiscussionFollowingAndMute(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Discussion</p>"})
	path := "/api/posts/" + post["id"].(string)
	kit.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>Following</p>"})
	mo.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>First reply</p>"})
	mo.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>Second reply</p>"})
	ns := notificationList(t, kit)
	if len(ns) != 1 || ns[0]["activity_count"] != float64(2) {
		t.Fatalf("discussion activity was not grouped: %v", ns)
	}
	kit.mustStatus(200, "PUT", path+"/notifications", map[string]bool{"following": false})
	mo.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>Muted reply</p>"})
	if got := notificationList(t, kit); len(got) != 1 || got[0]["activity_count"] != float64(2) {
		t.Fatalf("muted post notified: %v", got)
	}
	kit.mustStatus(200, "PUT", path+"/notifications", map[string]bool{"following": true})
	mo.mustStatus(201, "POST", path+"/comments", map[string]string{"body_html": "<p>Following again</p>"})
	ns = notificationList(t, kit)
	if ns[0]["activity_count"] != float64(3) {
		t.Fatalf("follow did not resume: %v", ns)
	}
	kit.mustStatus(200, "PUT", "/api/markers/post:"+post["id"].(string), map[string]int64{"read_at": db.Now()})
	if got := notificationList(t, kit); got[0]["read_at"] == nil {
		t.Fatalf("reading discussion did not clear notification: %v", got)
	}
}

func TestRoomNotificationGroupingAndRead(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	first := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Question</p>"})
	mo.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": fmt.Sprintf(`<p><span data-type="mention" data-mention-id="%s">@kit</span> answer</p>`, kitID), "reply_to": first["id"]})
	mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>More</p>"})
	ns := notificationList(t, kit)
	if len(ns) != 1 || ns[0]["activity_count"] != float64(2) {
		t.Fatalf("room notifications: %v", ns)
	}
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+perm.Root, map[string]int64{"read_at": db.Now()})
	if got := notificationList(t, kit); got[0]["read_at"] == nil {
		t.Fatalf("chat activity still unread: %v", got)
	}
}

func TestNotificationBulkActionsLeaveContentUnread(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Unread message</p>"})
	kit.mustStatus(200, "PUT", "/api/notifications/read", nil)
	if ns := notificationList(t, kit); len(ns) != 1 || ns[0]["read_at"] == nil {
		t.Fatalf("mark all read: %v", ns)
	}
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Another message</p>"})
	kit.mustStatus(200, "DELETE", "/api/notifications", nil)
	if ns := notificationList(t, kit); len(ns) != 0 {
		t.Fatalf("clear all left notifications: %v", ns)
	}
	for _, raw := range kit.mustStatus(200, "GET", "/api/markers", nil)["markers"].([]any) {
		m := raw.(map[string]any)
		if m["stream"] == "chat:"+perm.Root && m["unread"].(float64) == 0 {
			t.Fatal("clearing notifications marked chat content read")
		}
	}
}

func TestNotificationDeliveryUsesCurrentPreferencesAndAccess(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Private room", "mode": "chat"})
	gid := room["id"].(string)
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": kitID})
	owner.mustStatus(201, "POST", "/api/groups/"+gid+"/messages", map[string]string{"body_html": "<p>Private text</p>"})
	raw, _ := json.Marshal(notificationList(t, kit)[0])
	var n Notification
	json.Unmarshal(raw, &n)
	allowed := func(want bool) {
		t.Helper()
		got, err := srv.pushAllowed(context.Background(), n)
		if err != nil || got != want {
			t.Fatalf("push allowed = %v, %v, want %v", got, err, want)
		}
	}
	allowed(true)
	kit.mustStatus(200, "PUT", "/api/groups/"+gid+"/notifications", map[string]string{"mode": "mentions"})
	allowed(false)
	kit.mustStatus(200, "PUT", "/api/groups/"+gid+"/notifications", map[string]string{"mode": "all"})
	allowed(true)
	owner.mustStatus(204, "DELETE", "/api/groups/"+gid+"/members/"+kitID, nil)
	allowed(false)
	kit.mustStatus(404, "PUT", "/api/groups/"+gid+"/notifications", map[string]string{"mode": "all"})

	got := kit.mustStatus(200, "PUT", "/api/me/settings", map[string]bool{"push_comments": false})
	if got["push_comments"] != false || got["push_mentions"] != true || got["digest"] != "weekly" {
		t.Fatalf("partial preferences: %v", got)
	}
	got = kit.mustStatus(200, "PUT", "/api/me/settings", map[string]bool{"push_mentions": false})
	if got["push_comments"] != false {
		t.Fatalf("changing another preference reset comments: %v", got)
	}
}

func TestMentionTakesPriorityOverFollowedComment(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Question</p>"})
	kit.mustStatus(200, "PUT", "/api/me/settings", map[string]bool{"push_comments": false})
	owner.mustStatus(201, "POST", "/api/posts/"+post["id"].(string)+"/comments", map[string]string{"body_html": fmt.Sprintf(`<p><span data-type="mention" data-mention-id="%s">@kit</span> reply</p>`, kitID)})
	ns := notificationList(t, kit)
	if len(ns) != 1 || ns[0]["kind"] != NotifyMention || ns[0]["activity_count"] != float64(1) {
		t.Fatalf("mention did not win: %v", ns)
	}
	raw, _ := json.Marshal(ns[0])
	var n Notification
	json.Unmarshal(raw, &n)
	if ok, err := srv.pushAllowed(context.Background(), n); !ok || err != nil {
		t.Fatalf("comment preference blocked mention: %v %v", ok, err)
	}
	owner.mustStatus(201, "POST", "/api/posts/"+post["id"].(string)+"/comments", map[string]string{"body_html": "<p>Another comment</p>"})
	if ok, err := srv.pushAllowed(context.Background(), n); !ok || err != nil {
		t.Fatalf("later comment blocked mention: %v %v", ok, err)
	}
	kit.mustStatus(200, "PUT", "/api/posts/"+post["id"].(string)+"/notifications", map[string]bool{"following": false})
	if ok, err := srv.pushAllowed(context.Background(), n); ok || err != nil {
		t.Fatalf("post mute did not block mention: %v %v", ok, err)
	}
}

func TestOldNotificationRevisionDoesNotReadNewActivity(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>One</p>"})
	old := notificationList(t, kit)[0]
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>Two</p>"})
	// Both activities can have the same millisecond timestamp.
	if _, err := srv.DB.Exec("UPDATE notifications SET created_at=? WHERE id=?", old["created_at"], old["id"]); err != nil {
		t.Fatal(err)
	}
	kit.mustStatus(200, "PUT", fmt.Sprintf("/api/notifications/%s/read?before=%.0f&revision=1", old["id"], old["created_at"]), nil)
	if ns := notificationList(t, kit); ns[0]["read_at"] != nil {
		t.Fatal("old click read newer activity")
	}
}

type pushSendFunc func(context.Context, push.Subscription, []byte) (bool, error)

func (f pushSendFunc) Send(ctx context.Context, s push.Subscription, data []byte) (bool, error) {
	return f(ctx, s, data)
}

func TestPushRechecksEachDeviceSubscription(t *testing.T) {
	for _, change := range []string{"delete", "reassign"} {
		t.Run(change, func(t *testing.T) {
			ts, owner, srv := newTestServerWith(t)
			_, uid := registerMember(t, ts, owner, "kit")
			ctx := context.Background()
			for _, endpoint := range []string{"https://fcm.googleapis.com/fcm/send/one", "https://fcm.googleapis.com/fcm/send/two"} {
				if err := push.Subscribe(ctx, srv.DB, uid, push.Subscription{Endpoint: endpoint, P256dh: "p", Auth: "a"}, db.Now()); err != nil {
					t.Fatal(err)
				}
			}
			sent := 0
			p := push.Pusher{DB: srv.DB, Send: pushSendFunc(func(_ context.Context, s push.Subscription, _ []byte) (bool, error) {
				sent++
				if change == "delete" {
					_, err := srv.DB.Exec("DELETE FROM push_subscriptions WHERE endpoint != ?", s.Endpoint)
					return false, err
				}
				me := owner.mustStatus(200, "GET", "/api/me", nil)
				_, err := srv.DB.Exec("UPDATE push_subscriptions SET user_id=? WHERE endpoint != ?", me["id"], s.Endpoint)
				return false, err
			})}
			if err := p.Tell(ctx, uid, push.Payload{Title: "Sweet"}, nil); err != nil {
				t.Fatal(err)
			}
			if sent != 1 {
				t.Fatalf("sent to %d devices after %s", sent, change)
			}
		})
	}
}

func TestMentionSurvivesOrdinaryActivity(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "reviewkit")
	kit.mustStatus(200, "PUT", rootPath+"/notifications", map[string]string{"mode": "mentions"})
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": fmt.Sprintf(`<p><span data-type="mention" data-mention-id="%s">@kit</span> hi</p>`, kitID)})
	raw, _ := json.Marshal(notificationList(t, kit)[0])
	var mentioned Notification
	json.Unmarshal(raw, &mentioned)
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>unrelated message</p>"})
	if ok, err := srv.pushAllowed(context.Background(), mentioned); !ok || err != nil {
		t.Fatalf("eligible mention cancelled by ordinary message: %v %v", ok, err)
	}
	if err := srv.q().SetMarker(context.Background(), store.SetMarkerParams{UserID: kitID, Stream: mentioned.Scope, ReadAt: mentioned.CreatedAt}); err != nil {
		t.Fatal(err)
	}
	if ok, err := srv.pushAllowed(context.Background(), mentioned); ok || err != nil {
		t.Fatalf("read mention was delivered: %v %v", ok, err)
	}
}
