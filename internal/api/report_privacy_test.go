package api

import "testing"

func TestReportsHideStaffAuthorsAndReporterIdentities(t *testing.T) {
	for _, role := range []string{"owner", "moderator", "promoted"} {
		t.Run(role, func(t *testing.T) {
			ts, owner := newTestServer(t)
			author, authorID := registerMember(t, ts, owner, "author")
			reporter, _ := registerMember(t, ts, owner, "reporter")
			reviewer, reviewerID := registerMember(t, ts, owner, "reviewer")
			owner.mustStatus(200, "PUT", rootPath+"/members/"+reviewerID, map[string]string{"role": "moderator"})
			if role == "owner" {
				author = owner
			} else if role == "moderator" {
				owner.mustStatus(200, "PUT", rootPath+"/members/"+authorID, map[string]string{"role": "moderator"})
			}
			post := author.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>post</p>"})["id"].(string)
			comment := author.mustStatus(201, "POST", "/api/posts/"+post+"/comments", map[string]string{"body_html": "<p>comment</p>"})["id"].(string)
			message := author.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>message</p>"})["id"].(string)
			items := map[string]string{"post": post, "comment": comment, "message": message}
			for kind, id := range items {
				reporter.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": kind, "id": id, "reason": "Reason without a name"})
			}
			if role == "promoted" {
				owner.mustStatus(200, "PUT", rootPath+"/members/"+authorID, map[string]string{"role": "moderator"})
			}
			if len(reportsOf(author)) != 0 || len(reportNotes(author)) != 0 {
				t.Error("reported author received reports or report notifications")
			}
			list := reportsOf(reviewer)
			if len(list) != 3 {
				t.Fatalf("reviewer received %d reported items", len(list))
			}
			for _, item := range list {
				for _, entry := range item["reports"].([]any) {
					if _, exposed := entry.(map[string]any)["reporter"]; exposed {
						t.Error("report disclosed the reporter")
					}
				}
			}
			for _, note := range reportNotes(reviewer) {
				if note["actor"] != nil {
					t.Error("notification disclosed the reporter")
				}
				reviewer.mustStatus(200, "PUT", "/api/notifications/"+note["id"].(string)+"/read", nil)
			}
			for _, event := range reviewer.readEvents(1000) {
				payload := event["payload"].(map[string]any)
				if event["kind"] == "report" {
					for _, entry := range payload["reports"].([]any) {
						if _, exposed := entry.(map[string]any)["reporter"]; exposed {
							t.Error("replay disclosed the reporter")
						}
					}
				}
				if event["kind"] == "notification" && payload["kind"] == "report" && payload["actor"] != nil {
					t.Error("replayed notification disclosed the reporter")
				}
			}
			assertNoReportEvents(t, author)
			for kind, id := range items {
				for _, action := range []string{"dismiss", "delete"} {
					author.mustStatus(404, "POST", "/api/reports/"+kind+"/"+id+"/"+action, nil)
				}
				reviewer.mustStatus(204, "POST", "/api/reports/"+kind+"/"+id+"/dismiss", nil)
			}
			assertNoReportEvents(t, author)
		})
	}
}

func assertNoReportEvents(t *testing.T, c *client) {
	t.Helper()
	for _, event := range c.readEvents(1000) {
		payload := event["payload"].(map[string]any)
		if event["kind"] == "report" || event["kind"] == "report_delete" || (event["kind"] == "notification" && payload["kind"] == "report") {
			t.Error("reported author received a report event")
		}
	}
}

func TestOwnerReportWaitsForAnotherModerator(t *testing.T) {
	ts, owner := newTestServer(t)
	reporter, uid := registerMember(t, ts, owner, "reporter")
	id := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>post</p>"})["id"].(string)
	reporter.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": id})
	if len(reportsOf(owner)) != 0 || len(reportNotes(owner)) != 0 {
		t.Error("owner received a report about their own post")
	}
	owner.mustStatus(200, "PUT", rootPath+"/members/"+uid, map[string]string{"role": "moderator"})
	owner.mustStatus(200, "DELETE", "/api/posts/"+id, nil)
	if len(reportsOf(reporter)) != 1 {
		t.Fatal("pending report was lost after promotion or content deletion")
	}
	reporter.mustStatus(204, "POST", "/api/reports/post/"+id+"/dismiss", nil)
}

func TestReportDoesNotGiveItsAuthorImageAccess(t *testing.T) {
	ts, owner := newTestServer(t)
	reporter, _ := registerMember(t, ts, owner, "reporter")
	status, img := reporter.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatal("image upload failed")
	}
	url := img["url"].(string)
	body := `<img src="` + url + `" alt="" width="40" height="40" data-image-id="` + img["id"].(string) + `">`
	original := reporter.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": body})["id"].(string)
	id := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": body})["id"].(string)
	reporter.mustStatus(200, "DELETE", "/api/posts/"+original, nil)
	reporter.mustStatus(204, "POST", "/api/reports", map[string]string{"kind": "post", "id": id})
	owner.mustStatus(200, "DELETE", "/api/posts/"+id, nil)
	owner.mustStatus(404, "GET", url, nil)
}
