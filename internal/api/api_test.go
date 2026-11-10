package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/mail"
	"sweet/internal/store"
)

// newTestServer starts a real server on a temp-file database and logs the
// owner in. Each client has its own cookie jar, so a test can act as
// several users at once.
func newTestServer(t *testing.T) (*httptest.Server, *client) {
	t.Helper()
	ts, owner, _ := newTestServerWith(t)
	return ts, owner
}

// newTestServerWith also returns the Server, for tests that use it directly instead of through HTTP.
func newTestServerWith(t *testing.T) (*httptest.Server, *client, *Server) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.Migrate(context.Background(), d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := EnsureOwner(context.Background(), d, "raphael", "correct horse"); err != nil {
		t.Fatal(err)
	}
	imgs, err := images.NewLocal(filepath.Join(t.TempDir(), "images"))
	if err != nil {
		t.Fatal(err)
	}
	mailDir := filepath.Join(t.TempDir(), "mail")
	srv := &Server{DB: d, Hub: events.NewHub(d), Images: imgs, Mail: mail.Dir{Path: mailDir}, BaseURL: "http://sweet.test"}
	mux := http.NewServeMux()
	srv.Routes(mux)
	ts := httptest.NewServer(Protect(mux))
	t.Cleanup(ts.Close)
	mailDirs.Store(ts.URL, mailDir)
	owner := newClient(t, ts)
	owner.login("raphael", "correct horse")
	return ts, owner, srv
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, ts *httptest.Server) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: ts.URL, http: &http.Client{Jar: jar}}
}

// do sends JSON (or nothing) and returns the status and decoded body.
func (c *client) do(method, path string, body any, headers ...string) (int, map[string]any) {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, c.base+path, &buf)
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	if len(raw) > 0 {
		json.Unmarshal(raw, &out)
	}
	return res.StatusCode, out
}

func (c *client) login(username, password string) map[string]any {
	c.t.Helper()
	status, body := c.do("POST", "/api/login", map[string]string{"username": username, "password": password})
	if status != 200 {
		c.t.Fatalf("login %s: %d %v", username, status, body)
	}
	return body
}

func (c *client) mustStatus(want int, method, path string, body any) map[string]any {
	c.t.Helper()
	status, out := c.do(method, path, body)
	if status != want {
		c.t.Fatalf("%s %s: want %d, got %d %v", method, path, want, status, out)
	}
	return out
}

func TestUnauthenticatedIsRefused(t *testing.T) {
	ts, _ := newTestServer(t)
	anon := newClient(t, ts)
	for _, p := range []string{"/api/me", rootPath + "/posts", rootPath + "/messages", "/api/users", "/api/invites"} {
		anon.mustStatus(401, "GET", p, nil)
	}
	anon.mustStatus(401, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hi</p>"})
	anon.mustStatus(401, "GET", "/api/events", nil)
}

func TestLoginWrongPasswordAndUnknownUser(t *testing.T) {
	ts, _ := newTestServer(t)
	c := newClient(t, ts)
	_, body := c.do("POST", "/api/login", map[string]string{"username": "raphael", "password": "wrong"})
	_, body2 := c.do("POST", "/api/login", map[string]string{"username": "nobody", "password": "wrong"})
	if body["error"] != body2["error"] {
		t.Errorf("unknown user and wrong password must read the same: %v vs %v", body, body2)
	}
	c.mustStatus(401, "GET", "/api/me", nil)
}

func TestInviteRegisterAndSessions(t *testing.T) {
	ts, owner := newTestServer(t)

	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	code := inv["code"].(string)
	if !strings.HasPrefix(inv["url"].(string), "/join/") {
		t.Fatalf("invite url: %v", inv)
	}
	list := owner.mustStatus(200, "GET", "/api/invites", nil)
	if n := len(list["invites"].([]any)); n != 1 {
		t.Fatalf("open invites: want 1, got %d", n)
	}

	// An unauthenticated client can look up an invite code before registering.
	anon := newClient(t, ts)
	check := anon.mustStatus(200, "GET", "/api/invites/"+code, nil)
	if check["invited_by"] != "raphael" {
		t.Fatalf("invited_by: %v", check)
	}
	anon.mustStatus(404, "GET", "/api/invites/nope", nil)

	// Validation rules are checked before the invite is used.
	anon.mustStatus(400, "POST", "/api/register", map[string]string{"code": code, "username": "a", "email": "a@example.test"})
	anon.mustStatus(400, "POST", "/api/register", map[string]string{"code": code, "username": "admin", "email": "admin@example.test"})
	anon.mustStatus(404, "POST", "/api/register", map[string]string{"code": "nope", "username": "kit", "email": "kit@example.test"})
	if n := len(owner.mustStatus(200, "GET", "/api/invites", nil)["invites"].([]any)); n != 1 {
		t.Fatalf("failed registrations must not spend the invite; open invites = %d", n)
	}

	// A valid registration logs the new member in.
	kit := newClient(t, ts)
	kit.mustStatus(202, "POST", "/api/register", map[string]string{"code": code, "username": "kit", "email": "kit@example.test"})
	reg := kit.mustStatus(200, "POST", "/api/signin/link", map[string]string{"token": linkToken(mailed(t, ts, "kit@example.test", "signin")[0])})
	if reg["user"].(map[string]any)["username"] != "kit" || reg["token"] == "" {
		t.Fatalf("sign-in: %v", reg)
	}
	me := kit.mustStatus(200, "GET", "/api/me", nil)
	if me["username"] != "kit" {
		t.Fatalf("me: %v", me)
	}

	// The invite stays valid for the next user, so a group of people can join together. It counts its uses.
	newClient(t, ts).mustStatus(202, "POST", "/api/register", map[string]string{"code": code, "username": "kit2", "email": "kit2@example.test"})
	anon.mustStatus(200, "GET", "/api/invites/"+code, nil)
	if invs := owner.mustStatus(200, "GET", "/api/invites", nil)["invites"].([]any); len(invs) != 1 || invs[0].(map[string]any)["uses"] != 2.0 {
		t.Fatalf("open invites after two joins: %v", invs)
	}
	// A revoked invite works for nobody.
	owner.mustStatus(204, "DELETE", "/api/invites/"+code, nil)
	newClient(t, ts).mustStatus(404, "POST", "/api/register", map[string]string{"code": code, "username": "kit3", "email": "kit3@example.test"})

	// Usernames are unique, compared case-insensitively.
	inv2 := owner.mustStatus(201, "POST", "/api/invites", nil)
	newClient(t, ts).mustStatus(409, "POST", "/api/register", map[string]string{"code": inv2["code"].(string), "username": "KIT", "email": "kit-again@example.test"})
	// Registering with an address that already has an account returns 202 like any other registration.
	// No account is created, and the existing account's owner is emailed about the attempt. This prevents
	// email enumeration.
	had := mailCount(ts, "kit@example.test")
	again := newClient(t, ts).mustStatus(202, "POST", "/api/register", map[string]string{"code": inv2["code"].(string), "username": "kit2", "email": "KIT@example.test"})
	if again["email"] != "KIT@example.test" || mailCount(ts, "kit@example.test") != had+1 || mailCount(ts, "KIT@example.test") != 0 {
		t.Fatalf("taken address on register: %v, mail to owner %d (had %d)", again, mailCount(ts, "kit@example.test"), had)
	}
	newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "kit2", "password": "longenough"})
	// Without a valid invite, a taken username or address gets the same 404 as an unused one.
	newClient(t, ts).mustStatus(404, "POST", "/api/register", map[string]string{"code": "not-a-code", "username": "kit", "email": "kit@example.test"})
	newClient(t, ts).mustStatus(404, "POST", "/api/register", map[string]string{"code": "not-a-code", "username": "nobody", "email": "nobody@example.test"})

	// The token works as a bearer token without the cookie.
	bare := newClient(t, ts)
	status, body := bare.do("GET", "/api/me", nil, "Authorization", "Bearer "+reg["token"].(string))
	if status != 200 || body["username"] != "kit" {
		t.Fatalf("bearer: %d %v", status, body)
	}

	// Logout ends only the current session. Logout-all also ends the bearer session.
	kit2 := signIn(t, ts, "kit", "kit@example.test")
	kit.mustStatus(204, "POST", "/api/logout", nil)
	kit.mustStatus(401, "GET", "/api/me", nil)
	kit2.mustStatus(200, "GET", "/api/me", nil)
	kit2.mustStatus(204, "POST", "/api/logout-all", nil)
	kit2.mustStatus(401, "GET", "/api/me", nil)
	if status, _ := bare.do("GET", "/api/me", nil, "Authorization", "Bearer "+reg["token"].(string)); status != 401 {
		t.Fatalf("bearer session should be gone after logout-all, got %d", status)
	}

	// Members can list users but cannot create invites.
	kit3 := signIn(t, ts, "kit", "kit@example.test")
	users := kit3.mustStatus(200, "GET", "/api/users", nil)
	if n := len(users["users"].([]any)); n != 3 {
		t.Fatalf("users (the owner, kit, kit2): want 3, got %d", n)
	}
	kit3.mustStatus(403, "POST", "/api/invites", nil)
}

func TestPostsAreAuthoredBySessionAndEditedOnlyByAuthor(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>mine</p>"})
	if post["author"].(map[string]any)["username"] != "raphael" {
		t.Fatalf("author: %v", post)
	}
	id := post["id"].(string)
	kit.mustStatus(403, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>not yours</p>"})
	edited := owner.mustStatus(200, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>still mine</p>"})
	if edited["body_html"] != "<p>still mine</p>" {
		t.Fatalf("edit: %v", edited)
	}

	msg := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	if msg["author"].(map[string]any)["username"] != "kit" {
		t.Fatalf("message author: %v", msg)
	}
	posts := kit.mustStatus(200, "GET", rootPath+"/posts", nil)
	if n := len(posts["posts"].([]any)); n != 1 {
		t.Fatalf("posts visible to a member: %d", n)
	}
}

func TestCrossSiteWritesAreRefused(t *testing.T) {
	_, owner := newTestServer(t)
	status, _ := owner.do("POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"}, "Origin", "https://evil.example")
	if status != 403 {
		t.Fatalf("foreign Origin: want 403, got %d", status)
	}
	status, _ = owner.do("POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"}, "Sec-Fetch-Site", "cross-site")
	if status != 403 {
		t.Fatalf("Sec-Fetch-Site cross-site: want 403, got %d", status)
	}
	// Same-origin requests and requests without an Origin header (curl, the app shell) are allowed.
	status, _ = owner.do("POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"}, "Origin", owner.base)
	if status != 201 {
		t.Fatalf("same Origin: want 201, got %d", status)
	}
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"})
	// Read requests are never blocked.
	status, _ = owner.do("GET", rootPath+"/posts", nil, "Origin", "https://evil.example")
	if status != 200 {
		t.Fatalf("cross-origin GET: want 200, got %d", status)
	}
}

func TestOwnerPasswordIsSetOnceOnly(t *testing.T) {
	d, err := db.Open(filepath.Join(t.TempDir(), "o.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	if err := db.Migrate(ctx, d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	if _, err := EnsureOwner(ctx, d, "o", ""); err != nil {
		t.Fatal(err)
	}
	if needs, err := NeedsSetup(ctx, d); err != nil || !needs {
		t.Fatalf("an owner without a password needs setup: %v %v", needs, err)
	}
	EnsureOwner(ctx, d, "o", "first one")
	EnsureOwner(ctx, d, "o", "second one must not replace")
	srv := &Server{DB: d, Hub: events.NewHub(d)}
	mux := http.NewServeMux()
	srv.Routes(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()
	c := newClient(t, ts)
	c.login("o", "first one")
	if status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "o", "password": "second one must not replace"}); status != 401 {
		t.Fatalf("later -owner-password must be ignored, got %d", status)
	}
}

func TestUnknownAPIPathIsJSON404(t *testing.T) {
	_, owner := newTestServer(t)
	status, body := owner.do("POST", "/api/nope", nil)
	if status != 404 || body["error"] == nil {
		t.Fatalf("unknown /api path: want JSON 404, got %d %v", status, body)
	}
}

func TestComments(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a question</p>"})
	id := post["id"].(string)
	if post["comment_count"].(float64) != 0 {
		t.Fatalf("new post comment_count: %v", post["comment_count"])
	}

	// A new post has no comments. An unknown post returns 404 for both GET and POST.
	if n := len(owner.mustStatus(200, "GET", "/api/posts/"+id+"/comments", nil)["comments"].([]any)); n != 0 {
		t.Fatalf("comments on a new post: %d", n)
	}
	owner.mustStatus(404, "GET", "/api/posts/nope/comments", nil)
	owner.mustStatus(404, "POST", "/api/posts/nope/comments", map[string]string{"body_html": "<p>x</p>"})
	owner.mustStatus(400, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p> </p>"})

	// Kit comments. The quote is a plain blockquote in the body.
	c := kit.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<blockquote><p>a question</p></blockquote><p>an answer</p>"})
	if c["post_id"] != id || c["author"].(map[string]any)["username"] != "kit" || c["edited_at"] != nil {
		t.Fatalf("comment: %v", c)
	}
	cid := c["id"].(string)
	owner.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p>thanks</p>"})

	// Comments are listed oldest first. The post's comment_count now includes them.
	list := owner.mustStatus(200, "GET", "/api/posts/"+id+"/comments", nil)["comments"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["id"] != cid {
		t.Fatalf("comment list: %v", list)
	}
	posts := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if posts[0].(map[string]any)["comment_count"].(float64) != 2 {
		t.Fatalf("comment_count after two comments: %v", posts[0])
	}

	// Only the comment's author can edit it. Anyone else gets 403, including the post's author.
	owner.mustStatus(403, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>not yours</p>"})
	edited := kit.mustStatus(200, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>an answer, edited</p>"})
	if edited["post_id"] != id || edited["edited_at"] == nil || edited["body_html"] != "<p>an answer, edited</p>" {
		t.Fatalf("edited comment: %v", edited)
	}
	kit.mustStatus(404, "PUT", "/api/comments/nope", map[string]string{"body_html": "<p>x</p>"})

	// Editing the post keeps its comment_count.
	p2 := owner.mustStatus(200, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>a question, clarified</p>"})
	if p2["comment_count"].(float64) != 2 {
		t.Fatalf("comment_count after post edit: %v", p2)
	}
}

// upload sends bytes to POST /api/images as the multipart field "file" and
// returns the status and body.
func (c *client) upload(data []byte) (int, map[string]any) {
	c.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", "x.bin")
	fw.Write(data)
	mw.Close()
	req, _ := http.NewRequest("POST", c.base+"/api/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	out := map[string]any{}
	json.Unmarshal(raw, &out)
	return res.StatusCode, out
}

func testPNG(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.NRGBA{uint8(x), uint8(y), 90, 255})
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestImagesUploadServeAndPicture(t *testing.T) {
	ts, owner := newTestServer(t)

	// A file that is not an image is rejected based on its content, whatever its file name.
	if status, body := owner.upload([]byte("<script>alert(1)</script>")); status != 422 {
		t.Fatalf("non-image upload: %d %v", status, body)
	}

	status, img := owner.upload(testPNG(2400, 600))
	if status != 201 || img["width"].(float64) != 2000 || img["height"].(float64) != 500 {
		t.Fatalf("upload: %d %v", status, img)
	}
	url := img["url"].(string)

	// The image is served to members with a long private cache lifetime. It is not served to unauthenticated clients.
	// The test image is a smooth gradient, which is smaller as PNG than as JPEG, so it is stored as PNG.
	res, err := owner.http.Get(owner.base + url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/png" || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("serve: %d %v", res.StatusCode, res.Header)
	}
	if _, _, err := image.Decode(res.Body); err != nil {
		t.Fatalf("served bytes do not decode: %v", err)
	}
	if status, _ := newClient(t, ts).do("GET", url, nil); status != 401 {
		t.Fatalf("anonymous image fetch: want 401, got %d", status)
	}
	owner.mustStatus(404, "GET", "/img/nope", nil)

	// A post body can reference the image. The sanitiser keeps image paths on this server.
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{
		"body_html": `<p>look</p><img src="` + url + `" data-image-id="` + img["id"].(string) + `" alt="a test" width="2000" height="500">`,
	})
	if !strings.Contains(post["body_html"].(string), `src="`+url+`"`) {
		t.Fatalf("image stripped from body: %v", post["body_html"])
	}

	// Set the profile picture, then clear it.
	me := owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": img["id"]})
	if me["picture"] != url {
		t.Fatalf("picture set: %v", me)
	}
	if owner.mustStatus(200, "GET", "/api/me", nil)["picture"] != url {
		t.Fatal("picture not persisted on /api/me")
	}
	users := owner.mustStatus(200, "GET", "/api/users", nil)["users"].([]any)
	if users[0].(map[string]any)["picture"] != url {
		t.Fatalf("picture missing from people list: %v", users[0])
	}
	owner.mustStatus(404, "PUT", "/api/me/picture", map[string]any{"image_id": "nope"})
	me = owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": nil})
	if me["picture"] != nil {
		t.Fatalf("picture cleared: %v", me)
	}
}

func TestDeletePost(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>going</p>"})
	id := post["id"].(string)
	kit.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p>a comment</p>"})

	// A member cannot delete another user's post. The author can delete it once.
	kit.mustStatus(403, "DELETE", "/api/posts/"+id, nil)
	gone := owner.mustStatus(200, "DELETE", "/api/posts/"+id, nil)
	if gone["id"] != id {
		t.Fatalf("delete reply: %v", gone)
	}
	owner.mustStatus(404, "DELETE", "/api/posts/"+id, nil)
	owner.mustStatus(404, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>too late</p>"})
	if posts := owner.mustStatus(200, "GET", rootPath+"/posts", nil); len(posts["posts"].([]any)) != 0 {
		t.Fatalf("deleted post still listed: %v", posts)
	}
	// Deleting the post also deletes its comments.
	kit.mustStatus(404, "GET", "/api/posts/"+id+"/comments", nil)
	kit.mustStatus(404, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p>late</p>"})

	// The owner can delete anyone's post.
	theirs := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kit's</p>"})
	owner.mustStatus(200, "DELETE", "/api/posts/"+theirs["id"].(string), nil)

	// Both deletions are in the event log.
	rows, err := srv.q().ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range rows {
		if e.Kind == "post_delete" {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("post_delete events: want 2, got %d", n)
	}
}

func TestImageSweep(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	_ = ts
	upload := func() (string, string) {
		status, img := owner.upload(testPNG(40, 40))
		if status != 201 {
			t.Fatalf("upload: %d %v", status, img)
		}
		return img["id"].(string), img["url"].(string)
	}
	imgTag := func(id, url string) string {
		return `<img src="` + url + `" alt="" width="40" height="40" data-image-id="` + id + `">`
	}
	_, draftURL := upload()           // never used
	postID, postURL := upload()       // in a post that is kept
	deletedID, deletedURL := upload() // in a post that gets deleted
	commentID, commentURL := upload() // in a comment
	messageID, messageURL := upload() // in a chat message
	pictureID, pictureURL := upload() // a profile picture

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(postID, postURL)})
	owner.mustStatus(201, "POST", "/api/posts/"+post["id"].(string)+"/comments", map[string]string{"body_html": imgTag(commentID, commentURL)})
	doomed := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(deletedID, deletedURL)})
	owner.mustStatus(200, "DELETE", "/api/posts/"+doomed["id"].(string), nil)
	owner.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": imgTag(messageID, messageURL)})
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]string{"image_id": pictureID})

	// The sweep removes no image younger than the grace period, even if nothing references it.
	n, err := images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()-3_600_000)
	if err != nil || n != 0 {
		t.Fatalf("sweep inside grace: %d %v", n, err)
	}
	n, err = images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1)
	if err != nil || n != 2 {
		t.Fatalf("sweep: want 2 removed (draft, deleted post), got %d %v", n, err)
	}
	for url, want := range map[string]int{draftURL: 404, deletedURL: 404, postURL: 200, commentURL: 200, messageURL: 200, pictureURL: 200} {
		owner.mustStatus(want, "GET", url, nil)
	}
	// The sweep is idempotent.
	if n, err = images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1); err != nil || n != 0 {
		t.Fatalf("second sweep: %d %v", n, err)
	}
}

func TestDeleteComment(t *testing.T) {
	ts, owner := newTestServer(t)
	register := func(name string) *client {
		c, _ := registerMember(t, ts, owner, name)
		return c
	}
	kit, mo := register("kit"), register("mo")

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kit's post</p>"})
	pid := post["id"].(string)
	comment := func(c *client) string {
		return c.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>a comment</p>"})["id"].(string)
	}

	// Another member cannot delete Mo's comment. Mo can delete it once.
	byMo := comment(mo)
	register("jo").mustStatus(403, "DELETE", "/api/comments/"+byMo, nil)
	gone := mo.mustStatus(200, "DELETE", "/api/comments/"+byMo, nil)
	if gone["id"] != byMo || gone["post_id"] != pid {
		t.Fatalf("delete reply: %v", gone)
	}
	mo.mustStatus(404, "DELETE", "/api/comments/"+byMo, nil)
	mo.mustStatus(404, "PUT", "/api/comments/"+byMo, map[string]string{"body_html": "<p>too late</p>"})

	// The post's author can delete any comment on their post. The owner can delete any comment.
	kit.mustStatus(200, "DELETE", "/api/comments/"+comment(mo), nil)
	owner.mustStatus(200, "DELETE", "/api/comments/"+comment(mo), nil)

	// The remaining comment is listed and counted in comment_count.
	keep := comment(mo)
	list := kit.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil)["comments"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != keep {
		t.Fatalf("comments after deletions: %v", list)
	}
	posts := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if posts[0].(map[string]any)["comment_count"].(float64) != 1 {
		t.Fatalf("comment_count: %v", posts[0])
	}
	// Deleting a post deletes its comments, so deleting one of them afterwards returns 404.
	kit.mustStatus(200, "DELETE", "/api/posts/"+pid, nil)
	mo.mustStatus(404, "DELETE", "/api/comments/"+keep, nil)
}

func TestPictureChangeIsAnEvent(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	status, img := owner.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d %v", status, img)
	}
	// pictures returns the picture of each user event in the log.
	pictures := func() []any {
		rows, err := srv.q().ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 100})
		if err != nil {
			t.Fatal(err)
		}
		var out []any
		for _, e := range rows {
			if e.Kind != "user" {
				continue
			}
			var u map[string]any
			json.Unmarshal([]byte(e.Payload), &u)
			if u["username"] != "raphael" {
				t.Fatalf("user event payload: %s", e.Payload)
			}
			out = append(out, u["picture"])
		}
		return out
	}
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]string{"image_id": img["id"].(string)})
	if got := pictures(); len(got) != 1 || got[0] != img["url"] {
		t.Fatalf("user events after setting a picture: %v", got)
	}
	// The log keeps only the newest event about the user, so the second change replaces the first.
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": nil})
	if got := pictures(); len(got) != 1 || got[0] != nil {
		t.Fatalf("user events after removing the picture: %v", got)
	}
}

// mailDirs maps each test server's URL to the directory its mail is written
// to, so helpers that only have the server can read the mail it sent.
var mailDirs sync.Map

// newestMail returns the text of the newest email sent to an address, or "" if there is none.
func newestMail(t *testing.T, ts *httptest.Server, to string) string {
	t.Helper()
	dir, _ := mailDirs.Load(ts.URL)
	files, _ := filepath.Glob(filepath.Join(dir.(string), "*-"+strings.ReplaceAll(to, "@", "_at_")+".txt"))
	if len(files) == 0 {
		return ""
	}
	sort.Strings(files)
	raw, err := os.ReadFile(files[len(files)-1])
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

// mailed returns the links of one kind in the newest email sent to an address.
func mailed(t *testing.T, ts *httptest.Server, to, kind string) []string {
	t.Helper()
	var links []string
	for _, w := range strings.Fields(newestMail(t, ts, to)) {
		if strings.HasPrefix(w, "http://sweet.test/"+kind+"/") {
			links = append(links, w)
		}
	}
	return links
}

// mailCount returns the number of emails sent to an address.
func mailCount(ts *httptest.Server, to string) int {
	dir, _ := mailDirs.Load(ts.URL)
	files, _ := filepath.Glob(filepath.Join(dir.(string), "*-"+strings.ReplaceAll(to, "@", "_at_")+".txt"))
	return len(files)
}

// linkToken returns the token at the end of a link.
func linkToken(link string) string { return link[strings.LastIndex(link, "/")+1:] }

// registerMember registers a member with no password, signs them in through
// the link in the email they were sent, and returns their signed-in client
// and their id.
func registerMember(t *testing.T, ts *httptest.Server, owner *client, name string) (*client, string) {
	t.Helper()
	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	c := newClient(t, ts)
	email := name + "@example.test"
	c.mustStatus(202, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": name, "email": email})
	links := mailed(t, ts, email, "signin")
	if len(links) != 1 {
		t.Fatalf("sign-in mail to %s: %v", email, links)
	}
	res := c.mustStatus(200, "POST", "/api/signin/link", map[string]string{"token": linkToken(links[0])})
	return c, res["user"].(map[string]any)["id"].(string)
}

func can(v map[string]any) (edit, del bool) {
	c, _ := v["can"].(map[string]any)
	edit, _ = c["edit"].(bool)
	del, _ = c["delete"].(bool)
	return
}

func TestCanFlags(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")

	// Instance-level permissions are the root group's can flags (see TestRootGroupAndRoles).

	// A post. Its author can edit and delete it. The owner can only delete it. Another member can do neither.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kit's</p>"})
	if e, d := can(post); !e || !d {
		t.Fatalf("author's own post on create: edit %v delete %v", e, d)
	}
	first := func(c *client, key string) map[string]any {
		return c.mustStatus(200, "GET", rootPath+"/"+key, nil)[key].([]any)[0].(map[string]any)
	}
	if e, d := can(first(owner, "posts")); e || !d {
		t.Fatalf("owner on kit's post: edit %v delete %v", e, d)
	}
	if e, d := can(first(mo, "posts")); e || d {
		t.Fatalf("mo on kit's post: edit %v delete %v", e, d)
	}
	pid := post["id"].(string)

	// A comment by mo on kit's post. Mo can edit and delete it. Kit and the owner can delete it.
	c := mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>mo</p>"})
	if e, d := can(c); !e || !d {
		t.Fatalf("mo's own comment: edit %v delete %v", e, d)
	}
	comments := func(c *client) map[string]any {
		return c.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil)["comments"].([]any)[0].(map[string]any)
	}
	if e, d := can(comments(kit)); e || !d {
		t.Fatalf("post author on mo's comment: edit %v delete %v", e, d)
	}
	if e, d := can(comments(owner)); e || !d {
		t.Fatalf("owner on mo's comment: edit %v delete %v", e, d)
	}

	// A message. Its author and the owner can delete it. Nobody can edit it.
	m := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	if e, d := can(m); e || !d {
		t.Fatalf("own message: edit %v delete %v", e, d)
	}
	if e, d := can(first(kit, "messages")); e || d {
		t.Fatalf("kit on mo's message: edit %v delete %v", e, d)
	}
	if _, d := can(first(owner, "messages")); !d {
		t.Fatal("owner cannot delete a message")
	}
}

// readEvents opens the stream from the start and returns the first n events.
func (c *client) readEvents(n int) []map[string]any {
	c.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", c.base+"/api/events?since=0", nil)
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out []map[string]any
	var kind string
	sc := bufio.NewScanner(res.Body)
	for sc.Scan() && len(out) < n {
		line := sc.Text()
		switch {
		case line == ": caught up":
			// The replay is complete. No more events arrive until another write.
			return out
		case strings.HasPrefix(line, "event: "):
			kind = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "data: "):
			var payload map[string]any
			json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &payload)
			out = append(out, map[string]any{"kind": kind, "payload": payload})
		}
	}
	return out
}

func TestEventsAreUniformAndPersonalised(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>v1</p>"})
	pid := post["id"].(string)
	kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": "<p>v2</p>"})
	c := kit.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>c1</p>"})
	kit.mustStatus(200, "PUT", "/api/comments/"+c["id"].(string), map[string]string{"body_html": "<p>c2</p>"})

	// Each resource has two event kinds, the whole resource or its deletion. An edit is another "post" or "comment"
	// event, not a separate kind. The log keeps only the newest event for each resource, so the replay holds the
	// edited post and the edited comment once each.
	kinds := []string{}
	for _, e := range kit.readEvents(6) {
		if k := e["kind"].(string); k == "post" || k == "comment" {
			kinds = append(kinds, k+" "+e["payload"].(map[string]any)["body_html"].(string))
		}
	}
	if strings.Join(kinds, ",") != "post <p>v2</p>,comment <p>c2</p>" {
		t.Fatalf("event kinds: %v", kinds)
	}

	// Each viewer receives the same event with their own can flags.
	firstPost := func(c *client) map[string]any {
		for _, e := range c.readEvents(6) {
			if e["kind"] == "post" {
				return e["payload"].(map[string]any)
			}
		}
		t.Fatal("no post event")
		return nil
	}
	kitsView := firstPost(kit)
	ownersView := firstPost(owner)
	if e, d := can(kitsView); !e || !d {
		t.Fatalf("kit's view of own post over the stream: edit %v delete %v", e, d)
	}
	if e, d := can(ownersView); e || !d {
		t.Fatalf("owner's view of kit's post over the stream: edit %v delete %v", e, d)
	}
	if ownersView["body_html"] != "<p>v2</p>" {
		t.Fatalf("the post event in the replay is not the edited post: %v", ownersView["body_html"])
	}
}

func TestDeleteMessage(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	m := mo.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>oops</p>"})
	id := m["id"].(string)
	kit.mustStatus(403, "DELETE", "/api/messages/"+id, nil)
	gone := mo.mustStatus(200, "DELETE", "/api/messages/"+id, nil)
	if gone["id"] != id {
		t.Fatalf("delete reply: %v", gone)
	}
	mo.mustStatus(404, "DELETE", "/api/messages/"+id, nil)
	for _, x := range kit.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if x.(map[string]any)["id"] == id {
			t.Fatal("deleted message still listed")
		}
	}
	theirs := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>mine</p>"})
	owner.mustStatus(200, "DELETE", "/api/messages/"+theirs["id"].(string), nil)
	events := owner.readEvents(10)
	if e := events[len(events)-1]; e["kind"] != "message_delete" || e["payload"].(map[string]any)["id"] != theirs["id"] {
		t.Fatalf("last event: %v", e)
	}
}

// The response to every write, and every event the write logs, equals the
// resource as a GET returns it to that viewer. The rule "the stream carries
// the whole thing" depends on this property. A handler must not build a
// payload by hand. Doing that caused three bugs. A group was sent without its
// flags, a DM without its members, and a membership without its joined time.
func TestRepliesAndEventsMatchTheRow(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	// byID returns the item with the given id from a list response.
	byID := func(list map[string]any, key, id string) map[string]any {
		t.Helper()
		for _, x := range list[key].([]any) {
			if m := x.(map[string]any); m["id"] == id {
				return m
			}
		}
		t.Fatalf("%s %s not listed", key, id)
		return nil
	}
	byUser := func(list map[string]any, uid string) map[string]any {
		t.Helper()
		for _, x := range list["members"].([]any) {
			if m := x.(map[string]any); m["user"].(map[string]any)["id"] == uid {
				return m
			}
		}
		t.Fatalf("member %s not listed", uid)
		return nil
	}
	// lastEvent returns the viewer's newest event of a kind that matches one resource.
	lastEvent := func(c *client, kind string, match func(map[string]any) bool) map[string]any {
		t.Helper()
		var found map[string]any
		for _, e := range c.readEvents(80) {
			if e["kind"] == kind && match(e["payload"].(map[string]any)) {
				found = e["payload"].(map[string]any)
			}
		}
		if found == nil {
			t.Fatalf("no %s event", kind)
		}
		return found
	}
	same := func(what string, reply, fetched, event map[string]any) {
		t.Helper()
		if !reflect.DeepEqual(reply, fetched) {
			t.Errorf("%s: reply differs from fetch\nreply:   %v\nfetched: %v", what, reply, fetched)
		}
		if !reflect.DeepEqual(event, fetched) {
			t.Errorf("%s: event differs from fetch\nevent:   %v\nfetched: %v", what, event, fetched)
		}
	}
	isID := func(id string) func(map[string]any) bool { return func(m map[string]any) bool { return m["id"] == id } }
	isMember := func(gid, uid string) func(map[string]any) bool {
		return func(m map[string]any) bool { return m["group_id"] == gid && m["user"].(map[string]any)["id"] == uid }
	}

	// A post is created, commented on and edited. The edit includes the current comment count.
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>v1</p>"})
	pid := post["id"].(string)
	same("created post", post, byID(kit.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), lastEvent(kit, "post", isID(pid)))
	comment := kit.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>c1</p>"})
	cid := comment["id"].(string)
	same("created comment", comment, byID(kit.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil), "comments", cid), lastEvent(kit, "comment", isID(cid)))
	edited := kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": "<p>v2</p>"})
	same("edited post", edited, byID(kit.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), lastEvent(kit, "post", isID(pid)))
	editedC := kit.mustStatus(200, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>c2</p>"})
	same("edited comment", editedC, byID(kit.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil), "comments", cid), lastEvent(kit, "comment", isID(cid)))
	// The owner's view of the same post differs from kit's only in its can flags. The owner's stream event also matches the GET.
	same("post as the owner", byID(owner.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), byID(owner.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), lastEvent(owner, "post", isID(pid)))

	// Messages.
	msg := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	mid := msg["id"].(string)
	same("message", msg, byID(kit.mustStatus(200, "GET", rootPath+"/messages", nil), "messages", mid), lastEvent(kit, "message", isID(mid)))

	// A group is created and renamed. A member is added, promoted and made owner. A DM is created, then found by a second create.
	group := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gid := group["id"].(string)
	gp := "/api/groups/" + gid
	same("created group", group, kit.mustStatus(200, "GET", gp, nil), lastEvent(kit, "group", isID(gid)))
	same("creator's membership", byUser(kit.mustStatus(200, "GET", gp+"/members", nil), kitID), byUser(kit.mustStatus(200, "GET", gp+"/members", nil), kitID), lastEvent(kit, "membership", isMember(gid, kitID)))
	renamed := kit.mustStatus(200, "PUT", gp, map[string]string{"name": "Knitting circle"})
	same("renamed group", renamed, kit.mustStatus(200, "GET", gp, nil), lastEvent(kit, "group", isID(gid)))
	added := kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	same("added member", added, byUser(kit.mustStatus(200, "GET", gp+"/members", nil), moID), lastEvent(kit, "membership", isMember(gid, moID)))
	promoted := kit.mustStatus(200, "PUT", gp+"/members/"+moID, map[string]string{"role": "moderator"})
	same("promoted member", promoted, byUser(kit.mustStatus(200, "GET", gp+"/members", nil), moID), lastEvent(kit, "membership", isMember(gid, moID)))
	handed := kit.mustStatus(200, "PUT", gp+"/members/"+moID, map[string]string{"role": "owner"})
	same("new owner", handed, byUser(kit.mustStatus(200, "GET", gp+"/members", nil), moID), lastEvent(kit, "membership", isMember(gid, moID)))
	same("former owner", byUser(kit.mustStatus(200, "GET", gp+"/members", nil), kitID), byUser(kit.mustStatus(200, "GET", gp+"/members", nil), kitID), lastEvent(kit, "membership", isMember(gid, kitID)))
	// Mo is now the owner and gets the group with the owner's flags, both in the stream and from a GET.
	same("group as its new owner", mo.mustStatus(200, "GET", gp, nil), mo.mustStatus(200, "GET", gp, nil), lastEvent(mo, "group", isID(gid)))

	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	did := dm["id"].(string)
	same("created dm", dm, kit.mustStatus(200, "GET", "/api/groups/"+did, nil), lastEvent(kit, "group", isID(did)))
	found := kit.mustStatus(200, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	same("found dm", found, kit.mustStatus(200, "GET", "/api/groups/"+did, nil), lastEvent(kit, "group", isID(did)))
	same("dm as mo", mo.mustStatus(200, "GET", "/api/groups/"+did, nil), byID(mo.mustStatus(200, "GET", "/api/groups", nil), "groups", did), lastEvent(mo, "group", isID(did)))
}

// A post has its own URL. GET /api/posts/{id}
// returns the same post the feed lists, with the viewer's flags. A post in a
// group the viewer is not in, or a deleted post, returns 404 to that viewer.
func TestGetPost(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	kit.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>c</p>"})
	got := mo.mustStatus(200, "GET", "/api/posts/"+pid, nil)
	var listed map[string]any
	for _, x := range mo.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any) {
		if m := x.(map[string]any); m["id"] == pid {
			listed = m
		}
	}
	if !reflect.DeepEqual(got, listed) {
		t.Fatalf("fetched post differs from the listed one\nfetched: %v\nlisted:  %v", got, listed)
	}
	if got["comment_count"] != float64(1) {
		t.Fatalf("comment_count: %v", got["comment_count"])
	}

	// A post in a room that mo is not in returns 404 to mo.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	private := kit.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/posts", map[string]string{"body_html": "<p>wool</p>"})
	mo.mustStatus(404, "GET", "/api/posts/"+private["id"].(string), nil)
	kit.mustStatus(200, "GET", "/api/posts/"+private["id"].(string), nil)

	kit.mustStatus(200, "DELETE", "/api/posts/"+pid, nil)
	kit.mustStatus(404, "GET", "/api/posts/"+pid, nil)
	kit.mustStatus(404, "GET", "/api/posts/nothing", nil)
}

// delete_by_role marks a Delete that the viewer has only because of their role in the item's group, in the community
// or in a room, so the client can show the shield. It is false for the author, for a
// post's author deleting a comment on their post, and for anyone in a conversation.
func TestDeleteByRole(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	byRole := func(v map[string]any) bool {
		c, _ := v["can"].(map[string]any)
		b, _ := c["delete_by_role"].(bool)
		return b
	}
	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	if byRole(post) {
		t.Fatal("the author's own post is marked as deleted by role")
	}
	if p := owner.mustStatus(200, "GET", "/api/posts/"+pid, nil); !byRole(p) {
		t.Fatalf("the owner's view of kit's post: %v", p["can"])
	}
	comment := mo.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>hi</p>"})
	for _, c := range kit.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil)["comments"].([]any) {
		if m := c.(map[string]any); m["id"] == comment["id"] && (byRole(m) || !groupCan(m, "delete")) {
			t.Fatalf("the post's author's view of a comment on it: %v", m["can"])
		}
	}
	msg := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>chat</p>"})
	found := false
	for _, m := range owner.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any) {
		if mm := m.(map[string]any); mm["id"] == msg["id"] {
			found = byRole(mm)
		}
	}
	if !found {
		t.Fatal("the owner's view of kit's chat message is not marked as deleted by role")
	}
	// In kit's room, kit is the owner and deletes mo's post by role.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Knitting"})
	gid := room["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/members", map[string]string{"user_id": moID})
	rp := mo.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": "<p>room</p>"})
	if p := kit.mustStatus(200, "GET", "/api/posts/"+rp["id"].(string), nil); !byRole(p) {
		t.Fatalf("the room owner's view of a member's post: %v", p["can"])
	}
	// In a conversation, nobody has a role, so nothing is deleted by role.
	dm := mo.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{kit.mustStatus(200, "GET", "/api/me", nil)["id"].(string)}})
	dmsg := kit.mustStatus(201, "POST", "/api/groups/"+dm["id"].(string)+"/messages", map[string]string{"body_html": "<p>dm</p>"})
	for _, m := range mo.mustStatus(200, "GET", "/api/groups/"+dm["id"].(string)+"/messages", nil)["messages"].([]any) {
		if mm := m.(map[string]any); mm["id"] == dmsg["id"] && byRole(mm) {
			t.Fatal("a conversation message is marked as deleted by role")
		}
	}
}

// An upload over the size limit gets the same sentence as any image that is too large. The client shows a 4xx
// sentence to the user, so it must not describe the form encoding.
func TestUploadOverTheSizeLimitIsTooLarge(t *testing.T) {
	_, owner := newTestServer(t)
	data := make([]byte, images.MaxUpload+128<<10)
	copy(data, testPNG(8, 8))
	status, body := owner.upload(data)
	if status != http.StatusRequestEntityTooLarge || body["error"] != images.ErrTooLarge.Error() {
		t.Fatalf("got %d %v, want 413 %q", status, body, images.ErrTooLarge.Error())
	}
}

// A form without a file field is a client fault, and gets a general sentence.
func TestUploadWithoutAFileIsABadRequest(t *testing.T) {
	ts, owner := newTestServer(t)
	_ = ts
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	mw.WriteField("other", "x")
	mw.Close()
	req, _ := http.NewRequest("POST", owner.base+"/api/images", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := owner.http.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", res.StatusCode)
	}
}

// The sweep removes a picture once nothing uses it: a profile picture that was replaced or removed, the picture of a
// removed user and the picture of a deleted room. Current pictures stay. A deleted room once kept its picture, and
// the failed delete of that picture stopped every later sweep.
func TestSweepRemovesPicturesThatNothingUses(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	ctx := context.Background()
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	up := func(c *client) string {
		t.Helper()
		status, img := c.upload(testPNG(40, 40))
		if status != 201 {
			t.Fatalf("upload: %d %v", status, img)
		}
		return img["id"].(string)
	}
	replaced, current := up(owner), up(owner)
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": replaced})
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": current})
	removed := up(kit)
	kit.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": removed})
	kit.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": nil})
	ofRemovedUser := up(mo)
	mo.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": ofRemovedUser})
	owner.mustStatus(204, "DELETE", "/api/users/"+moID, nil)
	room := func(name, picture string) string {
		gid := owner.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": name, "mode": "both"})["id"].(string)
		owner.mustStatus(200, "PUT", "/api/groups/"+gid+"/picture", map[string]any{"image_id": picture})
		return gid
	}
	ofLiveRoom, ofDeletedRoom := up(owner), up(owner)
	room("Fells", ofLiveRoom)
	owner.mustStatus(200, "DELETE", "/api/groups/"+room("Moors", ofDeletedRoom), nil)

	n, err := images.Sweep(ctx, srv.DB, srv.Images, db.Now()+1)
	if err != nil || n != 4 {
		t.Fatalf("sweep: removed %d, want 4: %v", n, err)
	}
	for id, want := range map[string]bool{replaced: false, removed: false, ofRemovedUser: false, ofDeletedRoom: false, current: true, ofLiveRoom: true} {
		if _, err := srv.q().GetImage(ctx, id); (err == nil) != want {
			t.Errorf("image %s: exists %v, want %v", id, err == nil, want)
		}
	}
}

// failingStore fails to delete one key.
type failingStore struct {
	images.Store
	fail string
}

func (f failingStore) Delete(ctx context.Context, key string) error {
	if key == f.fail {
		return errors.New("storage is unavailable")
	}
	return f.Store.Delete(ctx, key)
}

// A failure on one image does not stop the sweep. The images' rows go, and a file that cannot be deleted stays listed
// and is tried again on the next run.
func TestSweepKeepsGoingPastAFailure(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	ctx := context.Background()
	var keys []string
	for range 2 {
		status, img := owner.upload(testPNG(40, 40))
		if status != 201 {
			t.Fatalf("upload: %d", status)
		}
		row, err := srv.q().GetImage(ctx, img["id"].(string))
		if err != nil {
			t.Fatal(err)
		}
		keys = append(keys, row.ID+"."+images.Ext(row.ContentType))
	}
	stored := func(key string) bool {
		r, err := srv.Images.Get(ctx, key)
		if err == nil {
			r.Close()
		}
		return err == nil
	}
	n, err := images.Sweep(ctx, srv.DB, failingStore{Store: srv.Images, fail: keys[0]}, db.Now()+1)
	if err == nil || n != 2 {
		t.Fatalf("sweep with one failure: removed %d, error %v; want 2 removed and the error", n, err)
	}
	if !stored(keys[0]) || stored(keys[1]) {
		t.Fatalf("after the first sweep: first file stored %v, second %v; want true, false", stored(keys[0]), stored(keys[1]))
	}
	if _, err := images.Sweep(ctx, srv.DB, srv.Images, db.Now()+1); err != nil || stored(keys[0]) {
		t.Fatalf("next sweep: %v, the first file is still stored: %v", err, stored(keys[0]))
	}
}

// An image whose client has gone by the time it is stored still gets its row, so its file is not left without one.
func TestAnImageIsKeptWhenItsClientHasGone(t *testing.T) {
	_, _, srv := newTestServerWith(t)
	owner, err := srv.q().GetUserByUsername(context.Background(), "raphael")
	if err != nil {
		t.Fatal(err)
	}
	p, err := images.Process(bytes.NewReader(testPNG(10, 10)))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	img, err := srv.storeImage(ctx, p, owner.ID)
	if err != nil {
		t.Fatalf("storing after the client went: %v", err)
	}
	if _, err := srv.q().GetImage(context.Background(), img.ID); err != nil {
		t.Fatalf("the image has no row: %v", err)
	}
}

// storeThatWrites sends a message from inside Delete.
type storeThatWrites struct {
	images.Store
	write func()
}

func (s storeThatWrites) Delete(ctx context.Context, key string) error {
	s.write()
	return s.Store.Delete(ctx, key)
}

// The sweep deletes stored files after its write transaction, so a slow bucket does not hold up writes. A message
// sent while the sweep deleted a file once failed, because the sweep held the database's write lock.
func TestTheSweepDeletesFilesOutsideItsTransaction(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	if status, _ := owner.upload(testPNG(40, 40)); status != 201 {
		t.Fatalf("upload: %d", status)
	}
	status := 0
	st := storeThatWrites{Store: srv.Images, write: func() {
		status, _ = owner.do("POST", rootPath+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	}}
	if _, err := images.Sweep(context.Background(), srv.DB, st, db.Now()+1); err != nil {
		t.Fatal(err)
	}
	if status != 201 {
		t.Fatalf("a message sent while the sweep deleted a file: %d", status)
	}
}
