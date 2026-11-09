package api

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/perm"
	"sweet/internal/push"
	"sweet/internal/store"
)

// Removing a user from the instance. Staff
// remove users from People. Any user can remove themselves from Settings. The
// removed user's content stays under a removed name. Each room they owned
// passes to another member by seniority, or is deleted. Their conversations
// stay in place. Their sessions end, and the name cannot be registered.
func TestRemoveFromInstance(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	jo, joID := registerMember(t, ts, owner, "jo")
	ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	rootPath := "/api/groups/" + perm.Root

	// Kit owns a club with mo (its moderator) and jo, is the only member of another room, and has a conversation with mo.
	club := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Club"})
	cp := "/api/groups/" + club["id"].(string)
	kit.mustStatus(201, "POST", cp+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(201, "POST", cp+"/members", map[string]string{"user_id": joID})
	kit.mustStatus(200, "PUT", cp+"/members/"+moID, map[string]string{"role": "moderator"})
	solo := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Solo"})
	pair := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	pid := pair["id"].(string)
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mine</p>"})
	others := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>the owner's</p>"})
	kit.mustStatus(201, "POST", "/api/posts/"+others["id"].(string)+"/comments", map[string]string{"body_html": "<p>kit's comment</p>"})
	jo.mustStatus(201, "POST", "/api/posts/"+post["id"].(string)+"/comments", map[string]string{"body_html": "<p>jo's comment on kit's post</p>"})
	said := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>kit's message</p>"})

	// A member can remove nobody. A moderator can remove members but not another moderator. Nobody can remove the owner,
	// and the owner cannot remove themselves.
	jo.mustStatus(403, "DELETE", "/api/users/"+moID, nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+moID, map[string]string{"role": "moderator"})
	owner.mustStatus(200, "PUT", rootPath+"/members/"+joID, map[string]string{"role": "moderator"})
	mo.mustStatus(403, "DELETE", "/api/users/"+joID, nil)
	mo.mustStatus(403, "DELETE", "/api/users/"+ownerID, nil)
	owner.mustStatus(403, "DELETE", "/api/users/"+ownerID, nil)
	owner.mustStatus(200, "PUT", rootPath+"/members/"+joID, map[string]string{"role": "member"})
	// The People list shows, for each viewer, which users that viewer can remove.
	canRemove := func(c *client, id string) bool {
		t.Helper()
		for _, u := range c.mustStatus(200, "GET", "/api/users", nil)["users"].([]any) {
			if m := u.(map[string]any); m["id"] == id {
				return m["can"].(map[string]any)["remove"] == true
			}
		}
		t.Fatalf("%s not listed", id)
		return false
	}
	if !canRemove(owner, kitID) || !canRemove(owner, moID) || canRemove(owner, ownerID) {
		t.Fatal("the owner's view of who may be removed")
	}
	if !canRemove(mo, kitID) || !canRemove(mo, moID) || canRemove(mo, ownerID) {
		t.Fatal("a moderator's view: members and themselves, not the owner")
	}
	if canRemove(jo, kitID) || !canRemove(jo, joID) {
		t.Fatal("a member's view: only themselves")
	}

	// The owner removes kit.
	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
	kit.mustStatus(401, "GET", "/api/me", nil)
	if status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "kit", "password": "longenough"}); status != 401 {
		t.Fatalf("a removed account signs in: %d", status)
	}
	for _, u := range owner.mustStatus(200, "GET", "/api/users", nil)["users"].([]any) {
		if u.(map[string]any)["id"] == kitID {
			t.Fatal("removed, still on People")
		}
	}
	removed := removedName(kitID)
	// Their posts, comments and messages are deleted, and comments by others on their posts go with the posts
	// (Raphael, 2026-11-08). The text is cleared, so it is not kept in the database either.
	for _, p := range owner.mustStatus(200, "GET", rootPath+"/posts?limit=50", nil)["posts"].([]any) {
		if p.(map[string]any)["id"] == post["id"] {
			t.Fatal("the removed person's post is still in the feed")
		}
	}
	if cs := owner.mustStatus(200, "GET", "/api/posts/"+others["id"].(string)+"/comments", nil)["comments"].([]any); len(cs) != 0 {
		t.Fatalf("the removed person's comment is still there: %v", cs)
	}
	for _, m := range owner.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if m.(map[string]any)["id"] == said["id"] {
			t.Fatal("the removed person's message is still in the chat")
		}
	}
	var kept int
	if err := srv.DB.QueryRow(`SELECT (SELECT count(*) FROM posts WHERE author_id = ?1 AND (body_text != '' OR deleted_at IS NULL))
		+ (SELECT count(*) FROM comments WHERE author_id = ?1 AND (body_text != '' OR deleted_at IS NULL))
		+ (SELECT count(*) FROM messages WHERE author_id = ?1 AND (body_text != '' OR deleted_at IS NULL))`, kitID).Scan(&kept); err != nil || kept != 0 {
		t.Fatalf("the removed person's content kept in the database: %d %v", kept, err)
	}
	// Ownership of the club passed to mo, its moderator, instead of jo. The room kit was alone in was deleted. The
	// conversation stays for mo, with kit under the removed name.
	for _, m := range mo.mustStatus(200, "GET", cp+"/members", nil)["members"].([]any) {
		mm := m.(map[string]any)
		switch mm["user"].(map[string]any)["id"] {
		case moID:
			if mm["role"] != "owner" {
				t.Fatalf("mo in the club: %v", mm["role"])
			}
		case kitID:
			t.Fatal("kit still in the club")
		}
	}
	if _, err := srv.q().GetGroup(context.Background(), solo["id"].(string)); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("the room kit was alone in: %v", err)
	}
	if got := memberNames(myGroups(mo)[pid]); got != "mo,"+removed {
		t.Fatalf("the pair after: %q", got)
	}
	mo.mustStatus(200, "GET", "/api/groups/"+pid+"/messages", nil)
	// Nobody can open a conversation with a removed user or add them to a group.
	mo.mustStatus(400, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kitID, joID}})
	mo.mustStatus(404, "POST", cp+"/members", map[string]string{"user_id": kitID})
	// Mo's stream included the rename, the club's new owner, and kit leaving the club.
	var renamed, newOwner, left bool
	for _, e := range mo.readEvents(120) {
		p, _ := e["payload"].(map[string]any)
		switch e["kind"] {
		case "user":
			renamed = renamed || (p["id"] == kitID && p["username"] == removed)
		case "membership":
			newOwner = newOwner || (p["group_id"] == club["id"] && p["user"].(map[string]any)["id"] == moID && p["role"] == "owner")
		case "membership_delete":
			left = left || (p["group_id"] == club["id"] && p["user_id"] == kitID)
		}
	}
	if !renamed || !newOwner || !left {
		t.Fatalf("mo's stream: renamed %v, new owner %v, left %v", renamed, newOwner, left)
	}

	// Jo removes themselves. A removed name cannot be registered.
	jo.mustStatus(204, "DELETE", "/api/users/"+joID, nil)
	jo.mustStatus(401, "GET", "/api/me", nil)
	code := owner.mustStatus(201, "POST", "/api/invites", nil)["code"].(string)
	if status, body := newClient(t, ts).do("POST", "/api/register", map[string]string{"code": code, "username": "removed-anyone", "email": "anyone@example.test"}); status != 400 {
		t.Fatalf("registering a removed name: %d %v", status, body)
	}
}

// A removed account cannot come back and is not notified. Removal deletes the account's email links and push
// subscriptions. A session of a removed account is refused. A comment on a
// removed user's post notifies nobody.
func TestRemovedUserCannotComeBackAndIsNotNotified(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	fake := &fakePush{gone: map[string]bool{}}
	srv.Push = &push.Pusher{DB: srv.DB, Send: fake}
	srv.PushKey = "test-public-key"
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	ctx := context.Background()

	post := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mine</p>"})
	mo.mustStatus(201, "POST", "/api/push/subscriptions", map[string]any{"endpoint": "https://fcm.googleapis.com/fcm/send/mo-phone", "keys": map[string]string{"p256dh": "p", "auth": "a"}})
	anon := newClient(t, ts)
	anon.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "mo"})
	token, code := signinMail(t, ts, "mo@example.test")
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)

	// The sign-in email sent before the removal no longer works, by link or by code.
	anon.mustStatus(404, "POST", "/api/signin/link", map[string]string{"token": token})
	anon.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": code})
	// A removed account is sent no sign-in email.
	had := mailCount(ts, "mo@example.test")
	anon.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "mo@example.test"})
	if mailCount(ts, "mo@example.test") != had {
		t.Fatal("a removed account was sent a sign-in email")
	}
	// The removed account has no push subscriptions left.
	if subs, err := srv.q().ListPushSubscriptions(ctx, moID); err != nil || len(subs) != 0 {
		t.Fatalf("push subscriptions after removal: %v %v", subs, err)
	}
	// A session of a removed account is refused, however it was made.
	token, hash, _ := auth.NewToken()
	now := db.Now()
	if err := srv.q().CreateSession(ctx, store.CreateSessionParams{ID: hash, UserID: moID, CreatedAt: now, LastSeenAt: now, ExpiresAt: now + SessionTTL.Milliseconds()}); err != nil {
		t.Fatal(err)
	}
	if status, _ := newClient(t, ts).do("GET", "/api/me", nil, "Authorization", "Bearer "+token); status != 401 {
		t.Fatalf("a removed account's session: %d", status)
	}
	// The removed user's post is gone, so nobody can comment on it, and they have no notifications.
	kit.mustStatus(404, "POST", "/api/posts/"+post["id"].(string)+"/comments", map[string]string{"body_html": "<p>nice</p>"})
	var n int
	if err := srv.DB.QueryRow("SELECT count(*) FROM notifications WHERE user_id = ?", moID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("notifications for a removed user: %d %v", n, err)
	}
}
