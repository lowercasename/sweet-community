package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"sweet/internal/perm"
)

type pausedRequestBody func([]byte) (int, error)

func (f pausedRequestBody) Read(p []byte) (int, error) { return f(p) }

func TestWritesRejectRemovedMembership(t *testing.T) {
	for _, resource := range []string{"posts", "messages", "members"} {
		t.Run(resource, func(t *testing.T) {
			ts, owner, srv := newTestServerWith(t)
			member, uid := registerMember(t, ts, owner, "reviewmember")
			room := owner.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Review room", "mode": "both"})["id"].(string)
			owner.mustStatus(201, "POST", "/api/groups/"+room+"/members", map[string]string{"user_id": uid})
			var outsider *client
			var outsiderID string
			if resource == "members" {
				owner.mustStatus(200, "PUT", "/api/groups/"+room+"/members/"+uid, map[string]string{"role": "moderator"})
				outsider, outsiderID = registerMember(t, ts, owner, "reviewoutsider")
				owner.mustStatus(201, "POST", "/api/groups/"+room+"/posts", map[string]string{"body_html": "<p>Private room content</p>"})
			}
			reading, resume, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
			var started, released sync.Once
			defer released.Do(func() { close(resume) })
			bodyText := `{"body_html":"<p>Written after removal</p>"}`
			if resource == "members" {
				bodyText = `{"user_id":"` + outsiderID + `"}`
			}
			body := strings.NewReader(bodyText)
			gate := pausedRequestBody(func(p []byte) (int, error) {
				started.Do(func() { close(reading) })
				<-resume
				return body.Read(p)
			})
			req, err := http.NewRequest("POST", ts.URL+"/api/groups/"+room+"/"+resource, gate)
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")
			for _, c := range member.http.Jar.Cookies(req.URL) {
				req.AddCookie(c)
			}
			mux := http.NewServeMux()
			srv.Routes(mux)
			response := httptest.NewRecorder()
			go func() { Protect(mux).ServeHTTP(response, req); close(done) }()
			select {
			case <-reading:
			case <-time.After(3 * time.Second):
				t.Fatal("handler did not read the request body")
			}
			owner.mustStatus(204, "DELETE", "/api/groups/"+room+"/members/"+uid, nil)
			released.Do(func() { close(resume) })
			select {
			case <-done:
			case <-time.After(3 * time.Second):
				t.Fatal("handler did not finish")
			}
			if resource == "members" {
				status, _ := outsider.do("GET", "/api/groups/"+room+"/posts", nil)
				t.Logf("write status=%d, outsider feed status=%d", response.Code, status)
				if response.Code != http.StatusNotFound || status != http.StatusNotFound {
					t.Error("removed moderator granted private room access to another user")
				}
				return
			}
			rows := owner.mustStatus(200, "GET", "/api/groups/"+room+"/"+resource, nil)[resource].([]any)
			persisted := false
			for _, row := range rows {
				if row.(map[string]any)["body_html"] == "<p>Written after removal</p>" {
					persisted = true
				}
			}
			t.Logf("status after completed removal=%d, new content persisted=%v", response.Code, persisted)
			if response.Code != http.StatusNotFound || persisted {
				t.Error("write accepted using membership that was already removed")
			}
		})
	}
}

// Change permissions after middleware has accepted the request but before its handler writes.
// This also covers requests without bodies, which can wait for the database after authorization.
func TestGroupWritesReadCurrentRole(t *testing.T) {
	for _, name := range []string{"picture", "rename", "mode", "delete room", "add member", "set role", "transfer", "remove member", "removed session"} {
		t.Run(name, func(t *testing.T) {
			ts, owner, srv := newTestServerWith(t)
			kit, kitID := registerMember(t, ts, owner, "kit")
			ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
			_, otherID := registerMember(t, ts, owner, "other")
			room := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Original", "mode": "both"})["id"].(string)
			kit.mustStatus(201, "POST", "/api/groups/"+room+"/members", map[string]string{"user_id": otherID})
			var handler http.HandlerFunc
			body := "{}"
			switch name {
			case "picture":
				handler, body = srv.setGroupPicture, `{"image_id":null}`
			case "rename":
				handler, body = srv.updateGroup, `{"name":"Changed"}`
			case "mode":
				handler, body = srv.updateGroup, `{"mode":"chat"}`
			case "delete room":
				handler = srv.deleteGroup
			case "add member":
				handler, body = srv.addMember, `{"user_id":"`+ownerID+`"}`
			case "set role":
				handler, body = srv.setMemberRole, `{"role":"moderator"}`
			case "transfer":
				handler, body = srv.setMemberRole, `{"role":"owner"}`
			case "remove member":
				handler = srv.removeMember
			case "removed session":
				handler, body = srv.createPost, `{"body_html":"<p>Late post</p>"}`
			}
			r := httptest.NewRequest("POST", ts.URL+"/api/groups/"+room, strings.NewReader(body))
			for _, cookie := range kit.http.Jar.Cookies(r.URL) {
				r.AddCookie(cookie)
			}
			r.SetPathValue("gid", room)
			r.SetPathValue("uid", otherID)
			var before int64
			wrapped := srv.requireGroup(func(w http.ResponseWriter, r *http.Request) {
				if name == "removed session" {
					if _, err := srv.DB.Exec(`DELETE FROM sessions WHERE user_id = ?`, kitID); err != nil {
						t.Fatal(err)
					}
				} else if _, err := srv.DB.Exec(`UPDATE memberships SET role = 'member' WHERE group_id = ? AND user_id = ?`, room, kitID); err != nil {
					t.Fatal(err)
				}
				var err error
				before, err = srv.q().LatestEventSequence(r.Context())
				if err != nil {
					t.Fatal(err)
				}
				handler(w, r)
			})
			w := httptest.NewRecorder()
			wrapped(w, r)
			want := http.StatusForbidden
			if name == "removed session" {
				want = http.StatusUnauthorized
			}
			if w.Code != want {
				t.Fatalf("write status = %d, want %d", w.Code, want)
			}
			after, err := srv.q().LatestEventSequence(r.Context())
			if err != nil || before != after {
				t.Fatalf("rejected write logged an event: %v", err)
			}
		})
	}
}

func TestStaffWritesReadCurrentRole(t *testing.T) {
	for _, name := range []string{"create topic", "edit topic", "delete topic", "rules", "welcome", "settings", "create invite", "delete invite"} {
		t.Run(name, func(t *testing.T) {
			ts, owner, srv := newTestServerWith(t)
			ownerID := owner.mustStatus(200, "GET", "/api/me", nil)["id"].(string)
			topic := owner.mustStatus(201, "POST", "/api/topics", map[string]string{"name": "Existing"})["id"].(string)
			invite := owner.mustStatus(201, "POST", "/api/invites", nil)["code"].(string)
			var handler http.HandlerFunc
			allowed := perm.ManageTopics
			body := `{"name":"Changed","description":""}`
			switch name {
			case "create topic":
				handler = srv.createTopic
			case "edit topic":
				handler = srv.updateTopic
			case "delete topic":
				handler = srv.deleteTopic
			case "rules":
				handler, allowed, body = srv.setText(rulesText), perm.ManageRules, `{"body_html":"<p>Changed</p>"}`
			case "welcome":
				handler, allowed, body = srv.setText(welcomeText), perm.ManageWelcome, `{"body_html":"<p>Changed</p>"}`
			case "settings":
				handler, allowed, body = srv.setSettings, perm.ManageInstance, `{"name":"Changed","group_creation":"anyone"}`
			case "create invite":
				handler, allowed = srv.createInvite, perm.Invite
			case "delete invite":
				handler, allowed = srv.deleteInvite, perm.Invite
			}
			r := httptest.NewRequest("POST", ts.URL+"/api/test", strings.NewReader(body))
			for _, cookie := range owner.http.Jar.Cookies(r.URL) {
				r.AddCookie(cookie)
			}
			r.SetPathValue("id", topic)
			r.SetPathValue("code", invite)
			wrapped := srv.requireRoot(allowed, func(w http.ResponseWriter, r *http.Request) {
				if _, err := srv.DB.Exec(`UPDATE memberships SET role = 'member' WHERE group_id = ? AND user_id = ?`, perm.Root, ownerID); err != nil {
					t.Fatal(err)
				}
				handler(w, r)
			})
			w := httptest.NewRecorder()
			wrapped(w, r)
			if w.Code != http.StatusForbidden {
				t.Fatalf("write status = %d, want 403", w.Code)
			}
		})
	}
}
