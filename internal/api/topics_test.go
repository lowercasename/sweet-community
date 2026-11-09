package api

import (
	"reflect"
	"testing"

	"sweet/internal/perm"
)

// Topics. A topic is a label on a post, and a post
// has at most one. The root group's staff manage topics. Any user can follow
// a topic to be notified of posts in it.

func makeModerator(t *testing.T, owner *client, uid string) {
	t.Helper()
	owner.mustStatus(200, "PUT", rootPath+"/members/"+uid, map[string]string{"role": perm.Moderator})
}

func topicIDs(list map[string]any) []string {
	var out []string
	for _, x := range list["topics"].([]any) {
		out = append(out, x.(map[string]any)["name"].(string))
	}
	return out
}

func TestTopicsAreKeptByStaff(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	// Only staff can create a topic. A moderator is staff.
	kit.mustStatus(403, "POST", "/api/topics", map[string]string{"name": "Practice"})
	practice := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": " Practice ", "description": " What is working. "})
	if practice["name"] != "Practice" || practice["description"] != "What is working." || practice["post_count"] != float64(0) || practice["following"] != false {
		t.Fatalf("created topic: %v", practice)
	}
	makeModerator(t, owner, moID)
	mo.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "reading"})
	owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Hangout"})

	// Names are unique, ignoring case, and have a maximum length.
	owner.mustStatus(409, "POST", "/api/topics", map[string]string{"name": "PRACTICE"})
	owner.mustStatus(400, "POST", "/api/topics", map[string]string{"name": "   "})
	owner.mustStatus(400, "POST", "/api/topics", map[string]string{"name": "A name of more than forty characters is too long"})

	// Every user can read the list. It is sorted alphabetically, ignoring case.
	got := topicIDs(kit.mustStatus(200, "GET", "/api/topics", nil))
	if !reflect.DeepEqual(got, []string{"Hangout", "Practice", "reading"}) {
		t.Fatalf("list: %v", got)
	}

	// Rename the topic and set its description. The response, the GET and the event are equal.
	pid := practice["id"].(string)
	renamed := owner.mustStatus(200, "PUT", "/api/topics/"+pid, map[string]string{"name": "Practice notes", "description": ""})
	kit.mustStatus(403, "PUT", "/api/topics/"+pid, map[string]string{"name": "x"})
	var fetched map[string]any
	for _, x := range kit.mustStatus(200, "GET", "/api/topics", nil)["topics"].([]any) {
		if m := x.(map[string]any); m["id"] == pid {
			fetched = m
		}
	}
	if !reflect.DeepEqual(renamed, fetched) {
		t.Fatalf("rename reply %v differs from fetch %v", renamed, fetched)
	}
	var event map[string]any
	for _, e := range kit.readEvents(80) {
		if e["kind"] == "topic" && e["payload"].(map[string]any)["id"] == pid {
			event = e["payload"].(map[string]any)
		}
	}
	if !reflect.DeepEqual(event, fetched) {
		t.Fatalf("topic event %v differs from fetch %v", event, fetched)
	}

	// Deleting a topic keeps its posts, with no topic. Every user receives topic_delete.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>filed</p>", "topic_id": pid})
	kit.mustStatus(403, "DELETE", "/api/topics/"+pid, nil)
	owner.mustStatus(200, "DELETE", "/api/topics/"+pid, nil)
	owner.mustStatus(404, "DELETE", "/api/topics/"+pid, nil)
	after := kit.mustStatus(200, "GET", "/api/posts/"+post["id"].(string), nil)
	if after["topic_id"] != nil {
		t.Fatalf("post after its topic went: %v", after)
	}
	deleted := false
	for _, e := range kit.readEvents(80) {
		if e["kind"] == "topic_delete" && e["payload"].(map[string]any)["id"] == pid {
			deleted = true
		}
	}
	if !deleted {
		t.Fatal("no topic_delete event")
	}
	if got := topicIDs(kit.mustStatus(200, "GET", "/api/topics", nil)); !reflect.DeepEqual(got, []string{"Hangout", "reading"}) {
		t.Fatalf("list after delete: %v", got)
	}
}

func TestAPostCarriesAtMostOneTopic(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	practice := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Practice"})["id"].(string)
	reading := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Reading"})["id"].(string)

	// A post can be given a topic when it is created, or none. A topic that does not exist is rejected. A room has no topics.
	filed := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>a</p>", "topic_id": practice})
	plain := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>b</p>"})
	if filed["topic_id"] != practice || plain["topic_id"] != nil {
		t.Fatalf("filed %v plain %v", filed["topic_id"], plain["topic_id"])
	}
	kit.mustStatus(400, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>c</p>", "topic_id": "nonsense"})
	room := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})["id"].(string)
	owner.mustStatus(400, "POST", "/api/groups/"+room+"/posts", map[string]any{"body_html": "<p>d</p>", "topic_id": practice})

	// The feed shows all posts, or the posts in one topic.
	all := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	only := kit.mustStatus(200, "GET", rootPath+"/posts?topic="+practice, nil)["posts"].([]any)
	if len(all) != 2 || len(only) != 1 || only[0].(map[string]any)["id"] != filed["id"] {
		t.Fatalf("all %d only %v", len(all), only)
	}
	if none := kit.mustStatus(200, "GET", rootPath+"/posts?topic="+reading, nil)["posts"].([]any); len(none) != 0 {
		t.Fatalf("reading: %v", none)
	}

	// The post's author and the root group's staff can set a post's topic, and the set_topic flag shows this.
	fid := filed["id"].(string)
	if filed["can"].(map[string]any)["set_topic"] != true {
		t.Fatalf("author's flag: %v", filed["can"])
	}
	asMo := kit.mustStatus(200, "GET", "/api/posts/"+fid, nil)
	_ = asMo
	seenByMo := mo.mustStatus(200, "GET", "/api/posts/"+fid, nil)
	if seenByMo["can"].(map[string]any)["set_topic"] == true {
		t.Fatalf("a bystander's flag: %v", seenByMo["can"])
	}
	mo.mustStatus(403, "PUT", "/api/posts/"+fid+"/topic", map[string]any{"topic_id": reading})
	moved := kit.mustStatus(200, "PUT", "/api/posts/"+fid+"/topic", map[string]any{"topic_id": reading})
	if moved["topic_id"] != reading {
		t.Fatalf("moved: %v", moved)
	}
	makeModerator(t, owner, moID)
	if mo.mustStatus(200, "GET", "/api/posts/"+fid, nil)["can"].(map[string]any)["set_topic"] != true {
		t.Fatal("a moderator may file anyone's post")
	}
	cleared := mo.mustStatus(200, "PUT", "/api/posts/"+fid+"/topic", map[string]any{"topic_id": nil})
	if cleared["topic_id"] != nil {
		t.Fatalf("cleared: %v", cleared)
	}
	// Editing the body does not change the topic. The same applies in a room.
	kit.mustStatus(200, "PUT", "/api/posts/"+fid+"/topic", map[string]any{"topic_id": practice})
	edited := kit.mustStatus(200, "PUT", "/api/posts/"+fid, map[string]string{"body_html": "<p>a2</p>"})
	if edited["topic_id"] != practice {
		t.Fatalf("edit moved the topic: %v", edited)
	}
	roomPost := owner.mustStatus(201, "POST", "/api/groups/"+room+"/posts", map[string]any{"body_html": "<p>e</p>"})
	owner.mustStatus(400, "PUT", "/api/posts/"+roomPost["id"].(string)+"/topic", map[string]any{"topic_id": practice})
}

func TestFollowingATopicTellsYouOfPostsInIt(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	practice := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Practice"})["id"].(string)

	mine := func(c *client, kind string) []map[string]any {
		t.Helper()
		var out []map[string]any
		for _, x := range c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any) {
			if m := x.(map[string]any); m["kind"] == kind {
				out = append(out, m)
			}
		}
		return out
	}

	// Following is per user, and the list shows it only to that user.
	followed := kit.mustStatus(200, "PUT", "/api/topics/"+practice+"/follow", nil)
	if followed["following"] != true || followed["follower_count"] != float64(1) {
		t.Fatalf("followed: %v", followed)
	}
	for _, x := range mo.mustStatus(200, "GET", "/api/topics", nil)["topics"].([]any) {
		if x.(map[string]any)["following"] != false {
			t.Fatalf("mo is not following: %v", x)
		}
	}

	// A post in the topic notifies its followers, never its author. A post without a topic notifies nobody.
	post := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>in practice</p>", "topic_id": practice})
	plain := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>plain</p>"})
	got := mine(kit, NotifyTopicPost)
	if len(got) != 1 || got[0]["post_id"] != post["id"] || got[0]["topic_id"] != practice || got[0]["user_id"] != kitID || got[0]["group_id"] != perm.Root {
		t.Fatalf("kit's topic notifications: %v", got)
	}
	if len(mine(mo, NotifyTopicPost)) != 0 || len(mine(owner, NotifyTopicPost)) != 0 {
		t.Fatal("the author or a non-follower was told")
	}
	// Moving a post into the topic also notifies them. Setting the same topic again does not.
	mo.mustStatus(200, "PUT", "/api/posts/"+plain["id"].(string)+"/topic", map[string]any{"topic_id": practice})
	mo.mustStatus(200, "PUT", "/api/posts/"+plain["id"].(string)+"/topic", map[string]any{"topic_id": practice})
	if got := mine(kit, NotifyTopicPost); len(got) != 2 {
		t.Fatalf("after a move: %v", got)
	}
	// A follower is not notified of their own post in the topic.
	kit.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>mine</p>", "topic_id": practice})
	if got := mine(kit, NotifyTopicPost); len(got) != 2 {
		t.Fatalf("told of my own post: %v", got)
	}
	// The notification event is sent to the follower only.
	told := 0
	for _, e := range kit.readEvents(120) {
		if e["kind"] == "notification" && e["payload"].(map[string]any)["kind"] == NotifyTopicPost {
			told++
		}
	}
	if told != 2 {
		t.Fatalf("kit heard %d topic_post events", told)
	}

	// After unfollowing, the user gets no more topic notifications. The follower count updates.
	unfollowed := kit.mustStatus(200, "DELETE", "/api/topics/"+practice+"/follow", nil)
	if unfollowed["following"] != false || unfollowed["follower_count"] != float64(0) {
		t.Fatalf("unfollowed: %v", unfollowed)
	}
	mo.mustStatus(201, "POST", rootPath+"/posts", map[string]any{"body_html": "<p>later</p>", "topic_id": practice})
	if got := mine(kit, NotifyTopicPost); len(got) != 2 {
		t.Fatalf("told after unfollowing: %v", got)
	}
	kit.mustStatus(404, "PUT", "/api/topics/nonsense/follow", nil)
}

// The root group carries manage_topics for its owner and moderators.
// The Community page and the feed's topic controls
// read it, so a moderator can reach the Topics card. Only the owner has
// manage_instance, for the community's own settings.
func TestStaffCarryManageTopics(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	if r := myGroups(owner)[rootPath[len("/api/groups/"):]]; !groupCan(r, "manage_topics") || !groupCan(r, "manage_instance") {
		t.Fatalf("the owner's root flags: %v", r["can"])
	}
	if r := myGroups(kit)[rootPath[len("/api/groups/"):]]; groupCan(r, "manage_topics") {
		t.Fatalf("a member manages topics: %v", r["can"])
	}
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	if r := myGroups(kit)[rootPath[len("/api/groups/"):]]; !groupCan(r, "manage_topics") || groupCan(r, "manage_instance") {
		t.Fatalf("a moderator's root flags: %v", r["can"])
	}
}
