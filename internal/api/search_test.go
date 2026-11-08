package api

import (
	"net/url"
	"strings"
	"testing"
)

// Search (architecture.md, Search). Search matches posts, comments and
// messages by their text, only in the groups the searcher is in. A deleted
// item is no longer found. An edited item is found by its new text. A comment
// on a deleted post is removed from search with the post. A query can never
// cause a syntax error.
func TestSearch(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	find := func(c *client, q string) []map[string]any {
		t.Helper()
		var out []map[string]any
		for _, x := range c.mustStatus(200, "GET", "/api/search?q="+url.QueryEscape(q), nil)["hits"].([]any) {
			out = append(out, x.(map[string]any))
		}
		return out
	}
	kinds := func(hits []map[string]any) string {
		var ks []string
		for _, h := range hits {
			ks = append(ks, h["kind"].(string))
		}
		return strings.Join(ks, ",")
	}

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>The <b>marmalade</b> is ready</p>"})
	pid := post["id"].(string)
	kit.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>marmalade for everyone</p>"})
	kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>who wants marmalade?</p>"})
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Jam", "mode": "both"})
	kit.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/posts", map[string]string{"body_html": "<p>secret marmalade</p>"})

	// Mo is only in the root group and finds the three items there, not the room's post. Each hit includes its group and author, with the match marked.
	hits := find(mo, "marmalade")
	if len(hits) != 3 {
		t.Fatalf("mo's hits: %v", hits)
	}
	for _, h := range hits {
		if h["group_id"] != rootPath[len("/api/groups/"):] || h["author"].(map[string]any)["username"] != "kit" {
			t.Fatalf("hit: %v", h)
		}
		if !strings.Contains(h["excerpt"].(string), MarkStart+"marmalade"+MarkEnd) {
			t.Fatalf("excerpt lacks the mark: %q", h["excerpt"])
		}
		if h["kind"] == "comment" && h["post_id"] != pid {
			t.Fatalf("a comment hit names its post: %v", h)
		}
	}
	if len(find(kit, "marmalade")) != 4 {
		t.Fatalf("kit, in the room too, finds %d", len(find(kit, "marmalade")))
	}
	// Any part of a word matches. A word shorter than three letters is not searched for.
	if len(find(kit, "marmal")) != 4 || len(find(kit, "armalade")) != 4 || len(find(kit, "marmalade is")) != 4 {
		t.Fatalf("prefix: %d, infix: %d, with a short word: %d", len(find(kit, "marmal")), len(find(kit, "armalade")), len(find(kit, "marmalade is")))
	}
	kit.mustStatus(400, "GET", "/api/search?q=ma", nil)
	// Stems and case do not matter. Every word must match. Query operators and syntax characters are treated as plain words.
	if len(find(mo, "MARMALADE ready")) != 1 || kinds(find(mo, "MARMALADE ready")) != "post" {
		t.Fatalf("two words: %v", find(mo, "MARMALADE ready"))
	}
	if len(find(mo, `marmalade AND OR NOT "(" *`)) != 0 {
		t.Fatalf("operators as words should match nothing")
	}
	mo.mustStatus(400, "GET", "/api/search?q=", nil)

	// An edited post is found by its new text. A deleted post is no longer found, and neither are its comments.
	kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": "<p>The quince is ready</p>"})
	if k := kinds(find(mo, "marmalade")); k != "comment,message" && k != "message,comment" {
		t.Fatalf("after the edit: %v", k)
	}
	if len(find(mo, "quince")) != 1 {
		t.Fatalf("the new words: %v", find(mo, "quince"))
	}
	kit.mustStatus(200, "DELETE", "/api/posts/"+pid, nil)
	if k := kinds(find(mo, "marmalade")); k != "message" {
		t.Fatalf("after deleting the post: %v", k)
	}
}
