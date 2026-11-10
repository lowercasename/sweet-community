package api

import (
	"database/sql"
	"testing"
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

// written counts the rows of a table, by id, that still hold text.
func written(t *testing.T, d *sql.DB, table string, ids ...string) int {
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
	if n := written(t, srv.DB, "posts", post); n != 0 {
		t.Fatal("the deleted post still holds its text")
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM comments WHERE id IN (?, ?) AND deleted_at IS NOT NULL", under, comment); n != 2 {
		t.Fatalf("deleted comments marked deleted: %d, want 2", n)
	}
	if n := written(t, srv.DB, "comments", under, comment); n != 0 {
		t.Fatalf("deleted comments that still hold text: %d", n)
	}
	if n := written(t, srv.DB, "messages", message); n != 0 {
		t.Fatal("the deleted message still holds its text")
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM search WHERE text LIKE '%secret%'"); n != 0 {
		t.Fatalf("search entries with deleted text: %d", n)
	}
	if n := written(t, srv.DB, "posts", other); n != 1 {
		t.Fatal("the post that was not deleted lost its text")
	}
}

// Removing a user deletes their posts as the author would, so the comments on those posts are emptied too.
func TestRemovingAUserEmptiesTheCommentsOnTheirPosts(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kit's post</p>"})["id"].(string)
	comment := owner.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>a reply to kit</p>"})["id"].(string)

	owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)

	if n := written(t, srv.DB, "comments", comment); n != 0 {
		t.Fatal("a comment on a removed user's post still holds its text")
	}
}

// Deleting a room empties its name and the text of everything in it. Its members, read markers, notifications,
// search entries and logged events are deleted. A room whose only member is removed from the community is deleted
// the same way.
func TestDeletingARoomEmptiesEverythingInIt(t *testing.T) {
	for _, how := range []string{"deleted by its owner", "its only member removed"} {
		t.Run(how, func(t *testing.T) {
			ts, owner, srv := newTestServerWith(t)
			kit, kitID := registerMember(t, ts, owner, "kit")
			maker := owner
			if how == "its only member removed" {
				maker = kit
			}
			gid := maker.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Secret room", "mode": "both"})["id"].(string)
			gp := "/api/groups/" + gid
			if maker == owner {
				owner.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": kitID})
			}
			post := kit.mustStatus(201, "POST", gp+"/posts", map[string]string{"body_html": "<p>secret post</p>"})["id"].(string)
			comment := maker.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>secret comment</p>"})["id"].(string)
			message := kit.mustStatus(201, "POST", gp+"/messages", map[string]string{"body_html": "<p>secret message</p>"})["id"].(string)
			kit.mustStatus(200, "PUT", "/api/markers/chat:"+gid, map[string]any{"read_at": int64(1)})
			if maker == owner && count(t, srv.DB, "SELECT COUNT(*) FROM notifications WHERE group_id = ?", gid) == 0 {
				t.Fatal("the room made no notifications to test with")
			}

			if maker == owner {
				owner.mustStatus(200, "DELETE", gp, nil)
			} else {
				owner.mustStatus(204, "DELETE", "/api/users/"+kitID, nil)
			}

			if n := count(t, srv.DB, "SELECT COUNT(*) FROM groups WHERE id = ? AND deleted_at IS NOT NULL AND name = ''", gid); n != 1 {
				t.Fatal("the room is not marked deleted with its name emptied")
			}
			if n := written(t, srv.DB, "posts", post) + written(t, srv.DB, "comments", comment) + written(t, srv.DB, "messages", message); n != 0 {
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
			if n := count(t, srv.DB, "SELECT COUNT(*) FROM events WHERE payload LIKE '%secret%' OR payload LIKE '%Secret room%'"); n != 0 {
				t.Errorf("logged events that hold the room's text: %d", n)
			}
		})
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

// SQLite overwrites deleted content with zeros, and the search index removes deleted entries at once, so emptied
// text does not stay in the database file.
func TestTheDatabaseOverwritesDeletedContent(t *testing.T) {
	_, _, srv := newTestServerWith(t)
	if n := count(t, srv.DB, "SELECT secure_delete FROM pragma_secure_delete"); n != 1 {
		t.Fatalf("secure_delete is %d, want 1", n)
	}
	if n := count(t, srv.DB, "SELECT COUNT(*) FROM search_config WHERE k = 'secure-delete' AND v = 1"); n != 1 {
		t.Fatal("the search index does not have secure-delete set")
	}
}
