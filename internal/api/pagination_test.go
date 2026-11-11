package api

import (
	"encoding/base64"
	"fmt"
	"net/url"
	"slices"
	"testing"
)

func TestPaginationRejectsInvalidCursors(t *testing.T) {
	_, owner := newTestServer(t)
	for _, raw := range []string{"100", "bad:cursor", "-1:item", "100:", "100" + string(make([]byte, 300))} {
		for _, value := range []string{raw, base64.RawURLEncoding.EncodeToString([]byte(raw))} {
			owner.mustStatus(400, "GET", rootPath+"/posts?before="+url.QueryEscape(value), nil)
		}
	}
}

func TestPaginationContinuesAfterCursorItemIsDeleted(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	var ids []string
	for i := 0; i < 3; i++ {
		p := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>Post</p>"})
		ids = append(ids, p["id"].(string))
	}
	if _, err := srv.DB.Exec(`UPDATE posts SET created_at = 100`); err != nil {
		t.Fatal(err)
	}
	first := owner.mustStatus(200, "GET", rootPath+"/posts?limit=2", nil)
	owner.mustStatus(200, "DELETE", "/api/posts/"+ids[1], nil)
	second := owner.mustStatus(200, "GET", rootPath+"/posts?limit=2&before="+url.QueryEscape(fmt.Sprint(first["next_before"])), nil)
	posts := second["posts"].([]any)
	if len(posts) != 1 || posts[0].(map[string]any)["id"] != ids[0] || second["next_before"] != nil {
		t.Fatalf("page after deleting the cursor item: %v", second)
	}
}

func TestPaginationIncludesEveryItemWithEqualTimestamps(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	uid := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
	for i := 1; i <= 7; i++ {
		id := fmt.Sprintf("item%02d", i)
		created := 100
		if i >= 6 {
			created = 200
		}
		for _, query := range []string{
			`INSERT INTO posts (id, group_id, author_id, body_html, body_text, created_at) VALUES (?, '00000000-0000-7000-8000-000000000000', ?, '', '', ?)`,
			`INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES (?, 'item01', ?, '', '', ?)`,
			`INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at) VALUES (?, '00000000-0000-7000-8000-000000000000', ?, '', '', ?)`,
			`INSERT INTO notifications (id, user_id, actor_id, kind, group_id, created_at) VALUES (?, ?2, ?2, 'added', '00000000-0000-7000-8000-000000000000', ?)`,
		} {
			if _, err := srv.DB.Exec(query, id, uid, created); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, list := range []struct{ path, key string }{
		{rootPath + "/posts", "posts"},
		{"/api/users/raphael/posts", "posts"},
		{"/api/posts/item01/comments", "comments"},
		{rootPath + "/messages", "messages"},
		{"/api/notifications", "notifications"},
	} {
		for _, limit := range []int{2, 3} {
			t.Run(fmt.Sprintf("%s/limit%d", list.path, limit), func(t *testing.T) {
				var got []string
				before := ""
				for pages := 0; pages < 8; pages++ {
					path := fmt.Sprintf("%s?limit=%d", list.path, limit)
					if before != "" {
						path += "&before=" + url.QueryEscape(before)
					}
					page := owner.mustStatus(200, "GET", path, nil)
					for _, item := range page[list.key].([]any) {
						got = append(got, item.(map[string]any)["id"].(string))
					}
					if page["next_before"] == nil {
						break
					}
					before = fmt.Sprint(page["next_before"])
				}
				want := []string{"item07", "item06", "item05", "item04", "item03", "item02", "item01"}
				if !slices.Equal(got, want) {
					t.Fatalf("paged IDs: %v, want %v", got, want)
				}
			})
		}
	}
}
