package api

import (
	"encoding/json"
	"strings"
	"testing"
)

// The event log is replayed to a client that reconnects (architecture.md,
// Realtime). It keeps only the newest event for each resource. A replay from
// the start therefore holds no earlier version of an edited post, no deleted
// post or message, no comment of a deleted post, no deleted message's text in
// a reply's quote, and no removed user's bio.
func TestReplayHoldsNoDeletedOrEarlierContent(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>first draft secret</p>"})
	kit.mustStatus(200, "PUT", "/api/posts/"+post["id"].(string), map[string]string{"body_html": "<p>final version</p>"})

	gone := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>deleted post secret</p>"})
	mo.mustStatus(201, "POST", "/api/posts/"+gone["id"].(string)+"/comments", map[string]string{"body_html": "<p>comment on a deleted post secret</p>"})
	kit.mustStatus(200, "DELETE", "/api/posts/"+gone["id"].(string), nil)

	said := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>deleted message secret</p>"})
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]any{"body_html": "<p>a reply</p>", "reply_to": said["id"]})
	kit.mustStatus(200, "DELETE", "/api/messages/"+said["id"].(string), nil)

	mo.mustStatus(200, "PUT", "/api/me/bio", map[string]string{"body_html": "<p>removed bio secret</p>"})
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)

	var all strings.Builder
	for _, e := range kit.readEvents(1000) {
		b, _ := json.Marshal(e)
		all.Write(b)
	}
	replay := all.String()
	if strings.Contains(replay, "secret") {
		t.Fatalf("the replay holds deleted or earlier content: %s", replay)
	}
	for _, want := range []string{"final version", "a reply"} {
		if !strings.Contains(replay, want) {
			t.Fatalf("the replay lost the current %q: %s", want, replay)
		}
	}
}
