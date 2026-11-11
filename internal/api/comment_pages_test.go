package api

import (
	"fmt"
	"net/url"
	"testing"
)

// Comments are listed a page at a time, the newest page first, as chat messages are. A thread with more comments than
// a page returns next_before, and asking with it returns the earlier comments.
func TestCommentsArePaged(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>A long thread</p>"})["id"].(string)
	var uid string
	if err := srv.DB.QueryRow("SELECT id FROM users WHERE username = 'raphael'").Scan(&uid); err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 60; i++ {
		if _, err := srv.DB.Exec(`INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			fmt.Sprintf("c%02d", i), post, uid, "<p>x</p>", "x", i); err != nil {
			t.Fatal(err)
		}
	}
	ids := func(page map[string]any) []string {
		var out []string
		for _, c := range page["comments"].([]any) {
			out = append(out, c.(map[string]any)["id"].(string))
		}
		return out
	}
	first := owner.mustStatus(200, "GET", "/api/posts/"+post+"/comments", nil)
	got := ids(first)
	if len(got) != 50 || got[0] != "c60" || got[49] != "c11" || first["next_before"] == nil {
		t.Fatalf("first page: %d comments from %s to %s, next_before %v", len(got), got[0], got[len(got)-1], first["next_before"])
	}
	earlier := owner.mustStatus(200, "GET", "/api/posts/"+post+"/comments?before="+url.QueryEscape(first["next_before"].(string)), nil)
	got = ids(earlier)
	if len(got) != 10 || got[0] != "c10" || got[9] != "c01" || earlier["next_before"] != nil {
		t.Fatalf("earlier page: %v, next_before %v", got, earlier["next_before"])
	}
}
