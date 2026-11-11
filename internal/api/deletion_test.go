package api

import (
	"database/sql"
	"testing"
	"time"

	"sweet/internal/perm"
)

// count runs a COUNT query against the database.
func count(t *testing.T, d *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := d.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

// withText counts the rows of a table, by id, that still hold text.
func withText(t *testing.T, d *sql.DB, table string, ids ...string) int {
	t.Helper()
	n := 0
	for _, id := range ids {
		n += count(t, d, "SELECT COUNT(*) FROM "+table+" WHERE id = ? AND (body_html != '' OR body_text != '')", id)
	}
	return n
}

// A deleted post, comment or message keeps its row, so replies, notifications and reports that point at it stay
// valid. Its text is emptied, and so is the text of a deleted post's comments. The search index holds none of it.
func TestDeletingEmptiesTheText(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>secret post</p>"})["id"].(string)
	under := kit.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>secret comment under it</p>"})["id"].(string)
	other := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>stays</p>"})["id"].(string)
	comment := kit.mustStatus(201, "POST", "/api/posts/"+other+"/comments", map[string]string{"body_html": "<p>secret comment</p>"})["id"].(string)
	message := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>secret message</p>"})["id"].(string)

	owner.mustStatus(200, "DELETE", "/api/posts/"+post, nil)
	kit.mustStatus(200, "DELETE", "/api/comments/"+comment, nil)
	kit.mustStatus(200, "DELETE", "/api/messages/"+message, nil)

	if n := count(t, srv.DB, "SELECT COUNT(*) FROM posts WHERE id = ? AND deleted_at IS NOT NULL", post); n != 1 {
		t.Fatal("the deleted post's row is gone or not marked deleted")
	}
	if n := withText(t, srv.DB, "posts", post); n != 0 {
		t.Fatal("the deleted post still holds its text")
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM comments WHERE id IN (?, ?) AND deleted_at IS NOT NULL", under, comment); n != 2 {
		t.Fatalf("deleted comments marked deleted: %d, want 2", n)
	}
	if n := withText(t, srv.DB, "comments", under, comment); n != 0 {
		t.Fatalf("deleted comments that still hold text: %d", n)
	}
	if n := withText(t, srv.DB, "messages", message); n != 0 {
		t.Fatal("the deleted message still holds its text")
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM search WHERE text LIKE '%secret%'"); n != 0 {
		t.Fatalf("search entries with deleted text: %d", n)
	}
	if n := withText(t, srv.DB, "posts", other); n != 1 {
		t.Fatal("the post that was not deleted lost its text")
	}
}

// Deleting a room empties its name and the text of everything in it. Its members, read markers, notifications,
// search entries and logged events are deleted. Every path that deletes a room uses removeGroup.
func TestDeletingARoomEmptiesEverythingInIt(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	gid := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Secret room", "mode": "both"})["id"].(string)
	gp := "/api/groups/" + gid
	owner.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": kitID})
	post := kit.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>secret post</p>"})["id"].(string)
	comment := owner.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>secret comment</p>"})["id"].(string)
	message := kit.mustStatus(201, "POST", gp+"/messages", map[string]string{"body_html": "<p>secret message</p>"})["id"].(string)
	kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": int64(1)})
	if count(t, srv.DB, "SELECT COUNT(*) FROM notifications WHERE group_id = ?", gid) == 0 {
		t.Fatal("the room made no notifications to test with")
	}

	owner.mustStatus(200, "DELETE", gp, nil)

	if n := count(t, srv.DB, "SELECT COUNT(*) FROM groups WHERE id = ? AND deleted_at IS NOT NULL AND name = ''", gid); n != 1 {
		t.Fatal("the room is not marked deleted with its name emptied")
	}
	if n := withText(t, srv.DB, "posts", post) + withText(t, srv.DB, "comments", comment) + withText(t, srv.DB, "messages", message); n != 0 {
		t.Fatalf("rows in the deleted room that still hold text: %d", n)
	}
	for _, q := range []string{
		"SELECT COUNT(*) FROM posts WHERE group_id = ? AND deleted_at IS NULL",
		"SELECT COUNT(*) FROM messages WHERE group_id = ? AND deleted_at IS NULL",
		"SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.group_id = ? AND c.deleted_at IS NULL",
		"SELECT COUNT(*) FROM memberships WHERE group_id = ?",
		"SELECT COUNT(*) FROM notifications WHERE group_id = ?",
		"SELECT COUNT(*) FROM read_markers WHERE stream IN ('chat:' || ?1, 'feed:' || ?1)",
		"SELECT COUNT(*) FROM search WHERE group_id = ?",
	} {
		if n := count(t, srv.DB, q, gid); n != 0 {
			t.Errorf("%s: %d rows left", q, n)
		}
	}
	// LIKE ignores case, so this also finds the room's name.
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM events WHERE payload LIKE '%secret%'"); n != 0 {
		t.Errorf("logged events that hold the room's text: %d", n)
	}
}

// A report keeps a copy of the item while it is open, so moderators can judge an item that has been edited or
// deleted. Closing the report, by dismissing it or by deleting the item, empties the copy.
func TestClosingAReportEmptiesItsCopy(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	for _, action := range []string{"dismiss", "delete"} {
		post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>reported post</p>"})["id"].(string)
		owner.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": post})
		if n := count(t, srv.DB, "SELECT COUNT(*) FROM reports WHERE subject_id = ? AND body_html != ''", post); n != 1 {
			t.Fatal("the open report holds no copy")
		}
		owner.mustStatus(204, "POST", "/api/reports/post/"+post+"/"+action, nil)
		if n := count(t, srv.DB, "SELECT COUNT(*) FROM reports WHERE subject_id = ? AND body_html != ''", post); n != 0 {
			t.Fatalf("a report closed by %s still holds its copy", action)
		}
	}
}

// Each deletion holds the write lock briefly, however large the search index is. Another write waits at most five
// seconds for the lock (busy_timeout), so a slow deletion makes other users' messages fail.
func TestLargeDeletionsAreQuick(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	_, kitID := registerMember(t, ts, owner, "kit")
	var uid string
	if err := srv.DB.QueryRow("SELECT id FROM users WHERE username = 'raphael'").Scan(&uid); err != nil {
		t.Fatal(err)
	}
	gid := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Large", "mode": "both"})["id"].(string)
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Many replies</p>"})["id"].(string)
	topic := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Busy"})["id"].(string)
	// 20,000 messages on Home, and 1,000 rows for each deletion below, each with a search entry.
	fill := func(n int, query string, args ...any) {
		t.Helper()
		if _, err := srv.DB.Exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) "+query, append([]any{n}, args...)...); err != nil {
			t.Fatal(err)
		}
	}
	fill(20000, "INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) SELECT 'home-' || i, ?, ?, '<p>x</p>', 'filler text ' || i, i FROM n", perm.Root, uid)
	fill(1000, "INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) SELECT 'room-' || i, ?, ?, '<p>x</p>', 'room text ' || i, i FROM n", gid, uid)
	fill(1000, "INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) SELECT 'comment-' || i, ?, ?, '<p>x</p>', 'comment text ' || i, i FROM n", post, uid)
	fill(1000, "INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) SELECT 'kit-' || i, ?, ?, '<p>x</p>', 'kit text ' || i, i FROM n", perm.Root, kitID)
	fill(1000, "INSERT INTO posts (id, group_id, author_id, body_html, body_text, created_at, topic_id) SELECT 'topic-' || i, ?, ?, '<p>x</p>', 'topic text ' || i, i, ? FROM n", perm.Root, uid, topic)

	for _, d := range []struct{ path string }{
		{"/api/groups/" + gid}, {"/api/posts/" + post}, {"/api/users/" + kitID}, {"/api/topics/" + topic},
	} {
		start := time.Now()
		if status, body := owner.do("DELETE", d.path, nil); status >= 300 {
			t.Fatalf("DELETE %s: %d %v", d.path, status, body)
		}
		if took := time.Since(start); took > 2*time.Second {
			t.Errorf("DELETE %s took %v", d.path, took)
		}
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM search WHERE text LIKE 'room text%' OR text LIKE 'comment text%' OR text LIKE 'kit text%'"); n != 0 {
		t.Fatalf("search entries left from the deleted rows: %d", n)
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM search WHERE text LIKE 'topic text%'"); n != 1000 {
		t.Fatalf("search entries of the posts whose topic was deleted: %d, want 1000", n)
	}
}

// Removing a user empties each of their rows once. Each update of a row also updates the search index.
func TestRemovingAUserEmptiesEachRowOnce(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	for range 3 {
		kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	}
	if _, err := srv.DB.Exec(`CREATE TABLE updates (n INTEGER);
		INSERT INTO updates VALUES (0);
		CREATE TRIGGER count_updates AFTER UPDATE ON messages BEGIN UPDATE updates SET n = n + 1; END;`); err != nil {
		t.Fatal(err)
	}
	// Kit's rows are the three messages and the chat line that says kit joined.
	rows := count(t, srv.DB, "SELECT COUNT(*) FROM messages WHERE author_id = ?", kitID)
	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
	if n := count(t, srv.DB, "SELECT n FROM updates"); n != rows {
		t.Fatalf("message rows updated %d times, want %d", n, rows)
	}
}

// When a removed user was the only member left in a room, the room is deleted with everything in it, including
// replies by people who left. No reply is logged again with its text.
func TestRemovingARoomsLastMemberLogsNoTextFromTheRoom(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	gid := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Small", "mode": "both"})["id"].(string)
	gp := "/api/groups/" + gid
	kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	asked := kit.mustStatus(201, "POST", gp+"/messages", map[string]string{"body_html": "<p>A question</p>"})["id"]
	mo.mustStatus(201, "POST", gp+"/messages", map[string]any{"body_html": "<p>secret reply</p>", "reply_to": asked})
	mo.mustStatus(204, "DELETE", gp+"/members/"+moID, nil)

	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)

	if n := count(t, srv.DB, "SELECT COUNT(*) FROM events WHERE payload LIKE '%secret reply%'"); n != 0 {
		t.Fatalf("logged events that hold the reply's text: %d", n)
	}
}
