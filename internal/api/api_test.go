package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
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
	"strings"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/store"
)

// newTestServer boots a real server on a temp-file database with the owner
// signed in. Each client has its own cookie jar, so tests can act as
// several people at once.
func newTestServer(t *testing.T) (*httptest.Server, *client) {
	t.Helper()
	ts, owner, _ := newTestServerWith(t)
	return ts, owner
}

// newTestServerWith also hands back the Server, for tests that reach past HTTP.
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
	srv := &Server{DB: d, Hub: events.NewHub(d), Images: imgs}
	mux := http.NewServeMux()
	srv.Routes(mux)
	ts := httptest.NewServer(Protect(mux))
	t.Cleanup(ts.Close)
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

	// Anyone can check a link before signing up.
	anon := newClient(t, ts)
	check := anon.mustStatus(200, "GET", "/api/invites/"+code, nil)
	if check["invited_by"] != "raphael" {
		t.Fatalf("invited_by: %v", check)
	}
	anon.mustStatus(404, "GET", "/api/invites/nope", nil)

	// Rules before the invite is spent.
	anon.mustStatus(400, "POST", "/api/register", map[string]string{"code": code, "username": "a", "password": "longenough"})
	anon.mustStatus(400, "POST", "/api/register", map[string]string{"code": code, "username": "admin", "password": "longenough"})
	anon.mustStatus(400, "POST", "/api/register", map[string]string{"code": code, "username": "kit", "password": "short"})
	anon.mustStatus(404, "POST", "/api/register", map[string]string{"code": "nope", "username": "kit", "password": "longenough"})
	if n := len(owner.mustStatus(200, "GET", "/api/invites", nil)["invites"].([]any)); n != 1 {
		t.Fatalf("failed registrations must not spend the invite; open invites = %d", n)
	}

	// A good registration signs the new member in.
	kit := newClient(t, ts)
	reg := kit.mustStatus(201, "POST", "/api/register", map[string]string{"code": code, "username": "kit", "password": "longenough"})
	if reg["user"].(map[string]any)["username"] != "kit" || reg["token"] == "" {
		t.Fatalf("register: %v", reg)
	}
	me := kit.mustStatus(200, "GET", "/api/me", nil)
	if me["username"] != "kit" {
		t.Fatalf("me: %v", me)
	}

	// The link is spent.
	newClient(t, ts).mustStatus(404, "POST", "/api/register", map[string]string{"code": code, "username": "kit2", "password": "longenough"})
	anon.mustStatus(404, "GET", "/api/invites/"+code, nil)
	if n := len(owner.mustStatus(200, "GET", "/api/invites", nil)["invites"].([]any)); n != 0 {
		t.Fatalf("open invites after use: %d", n)
	}

	// Usernames are unique, case-insensitively.
	inv2 := owner.mustStatus(201, "POST", "/api/invites", nil)
	newClient(t, ts).mustStatus(409, "POST", "/api/register", map[string]string{"code": inv2["code"].(string), "username": "KIT", "password": "longenough"})

	// The bearer form of the token works without the cookie.
	bare := newClient(t, ts)
	status, body := bare.do("GET", "/api/me", nil, "Authorization", "Bearer "+reg["token"].(string))
	if status != 200 || body["username"] != "kit" {
		t.Fatalf("bearer: %d %v", status, body)
	}

	// Log out ends this session only; log out everywhere ends the bearer one too.
	kit2 := newClient(t, ts)
	kit2.login("kit", "longenough")
	kit.mustStatus(204, "POST", "/api/logout", nil)
	kit.mustStatus(401, "GET", "/api/me", nil)
	kit2.mustStatus(200, "GET", "/api/me", nil)
	kit2.mustStatus(204, "POST", "/api/logout-all", nil)
	kit2.mustStatus(401, "GET", "/api/me", nil)
	if status, _ := bare.do("GET", "/api/me", nil, "Authorization", "Bearer "+reg["token"].(string)); status != 401 {
		t.Fatalf("bearer session should be gone after logout-all, got %d", status)
	}

	// Members may list people and may not mint invites.
	kit3 := newClient(t, ts)
	kit3.login("kit", "longenough")
	users := kit3.mustStatus(200, "GET", "/api/users", nil)
	if n := len(users["users"].([]any)); n != 2 {
		t.Fatalf("users: want 2, got %d", n)
	}
	kit3.mustStatus(403, "POST", "/api/invites", nil)
}

func TestPostsAreAuthoredBySessionAndEditedOnlyByAuthor(t *testing.T) {
	ts, owner := newTestServer(t)
	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	kit := newClient(t, ts)
	kit.mustStatus(201, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": "kit", "password": "longenough"})

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
	// Same-origin and no-Origin (curl, the app shell) are fine.
	status, _ = owner.do("POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"}, "Origin", owner.base)
	if status != 201 {
		t.Fatalf("same Origin: want 201, got %d", status)
	}
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>x</p>"})
	// Reads are never blocked.
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
	if OwnerHasPassword(ctx, d, "o") {
		t.Fatal("no password yet")
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
	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	kit := newClient(t, ts)
	kit.mustStatus(201, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": "kit", "password": "longenough"})

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a question</p>"})
	id := post["id"].(string)
	if post["comment_count"].(float64) != 0 {
		t.Fatalf("new post comment_count: %v", post["comment_count"])
	}

	// Nothing yet; unknown post is a 404 either way.
	if n := len(owner.mustStatus(200, "GET", "/api/posts/"+id+"/comments", nil)["comments"].([]any)); n != 0 {
		t.Fatalf("comments on a new post: %d", n)
	}
	owner.mustStatus(404, "GET", "/api/posts/nope/comments", nil)
	owner.mustStatus(404, "POST", "/api/posts/nope/comments", map[string]string{"body_html": "<p>x</p>"})
	owner.mustStatus(400, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p> </p>"})

	// Kit answers; the quote is just a blockquote in the body.
	c := kit.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<blockquote><p>a question</p></blockquote><p>an answer</p>"})
	if c["post_id"] != id || c["author"].(map[string]any)["username"] != "kit" || c["edited_at"] != nil {
		t.Fatalf("comment: %v", c)
	}
	cid := c["id"].(string)
	owner.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p>thanks</p>"})

	// Listed oldest first; the post now counts them.
	list := owner.mustStatus(200, "GET", "/api/posts/"+id+"/comments", nil)["comments"].([]any)
	if len(list) != 2 || list[0].(map[string]any)["id"] != cid {
		t.Fatalf("comment list: %v", list)
	}
	posts := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if posts[0].(map[string]any)["comment_count"].(float64) != 2 {
		t.Fatalf("comment_count after two comments: %v", posts[0])
	}

	// Author-only edit: 403 for someone else's, even the post's author.
	owner.mustStatus(403, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>not yours</p>"})
	edited := kit.mustStatus(200, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>an answer, edited</p>"})
	if edited["post_id"] != id || edited["edited_at"] == nil || edited["body_html"] != "<p>an answer, edited</p>" {
		t.Fatalf("edited comment: %v", edited)
	}
	kit.mustStatus(404, "PUT", "/api/comments/nope", map[string]string{"body_html": "<p>x</p>"})

	// Editing the post keeps its count.
	p2 := owner.mustStatus(200, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>a question, clarified</p>"})
	if p2["comment_count"].(float64) != 2 {
		t.Fatalf("comment_count after post edit: %v", p2)
	}
}

// upload posts bytes as multipart field "file" and returns status and body.
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

	// Not an image: refused by content, whatever the name.
	if status, body := owner.upload([]byte("<script>alert(1)</script>")); status != 422 {
		t.Fatalf("non-image upload: %d %v", status, body)
	}

	status, img := owner.upload(testPNG(2400, 600))
	if status != 201 || img["width"].(float64) != 2000 || img["height"].(float64) != 500 {
		t.Fatalf("upload: %d %v", status, img)
	}
	url := img["url"].(string)

	// Served to members with a long private cache life; not to strangers.
	res, err := owner.http.Get(owner.base + url)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "image/jpeg" || !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("serve: %d %v", res.StatusCode, res.Header)
	}
	if _, _, err := image.Decode(res.Body); err != nil {
		t.Fatalf("served bytes do not decode: %v", err)
	}
	if status, _ := newClient(t, ts).do("GET", url, nil); status != 401 {
		t.Fatalf("anonymous image fetch: want 401, got %d", status)
	}
	owner.mustStatus(404, "GET", "/img/nope", nil)

	// A body may reference it; the sanitiser keeps our own path.
	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{
		"body_html": `<p>look</p><img src="` + url + `" data-image-id="` + img["id"].(string) + `" alt="a test" width="2000" height="500">`,
	})
	if !strings.Contains(post["body_html"].(string), `src="`+url+`"`) {
		t.Fatalf("image stripped from body: %v", post["body_html"])
	}

	// Profile picture on, then off.
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
	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	kit := newClient(t, ts)
	kit.mustStatus(201, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": "kit", "password": "longenough"})

	post := owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>going</p>"})
	id := post["id"].(string)
	kit.mustStatus(201, "POST", "/api/posts/"+id+"/comments", map[string]string{"body_html": "<p>a comment</p>"})

	// A member cannot delete someone else's post; the author can, once.
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
	// Its comments go with it.
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
	postID, postURL := upload()       // in a live post
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

	// Nothing younger than the grace period goes, however unreferenced.
	n, err := images.Sweep(context.Background(), srv.q(), srv.Images, db.Now()-3_600_000)
	if err != nil || n != 0 {
		t.Fatalf("sweep inside grace: %d %v", n, err)
	}
	n, err = images.Sweep(context.Background(), srv.q(), srv.Images, db.Now()+1)
	if err != nil || n != 2 {
		t.Fatalf("sweep: want 2 removed (draft, deleted post), got %d %v", n, err)
	}
	for url, want := range map[string]int{draftURL: 404, deletedURL: 404, postURL: 200, commentURL: 200, messageURL: 200, pictureURL: 200} {
		owner.mustStatus(want, "GET", url, nil)
	}
	// Idempotent.
	if n, err = images.Sweep(context.Background(), srv.q(), srv.Images, db.Now()+1); err != nil || n != 0 {
		t.Fatalf("second sweep: %d %v", n, err)
	}
}

func TestDeleteComment(t *testing.T) {
	ts, owner := newTestServer(t)
	register := func(name string) *client {
		inv := owner.mustStatus(201, "POST", "/api/invites", nil)
		c := newClient(t, ts)
		c.mustStatus(201, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": name, "password": "longenough"})
		return c
	}
	kit, mo := register("kit"), register("mo")

	post := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>kit's post</p>"})
	pid := post["id"].(string)
	comment := func(c *client) string {
		return c.mustStatus(201, "POST", "/api/posts/"+pid+"/comments", map[string]string{"body_html": "<p>a comment</p>"})["id"].(string)
	}

	// Mo's comment: a bystander cannot delete it; Mo can, once.
	byMo := comment(mo)
	register("jo").mustStatus(403, "DELETE", "/api/comments/"+byMo, nil)
	gone := mo.mustStatus(200, "DELETE", "/api/comments/"+byMo, nil)
	if gone["id"] != byMo || gone["post_id"] != pid {
		t.Fatalf("delete reply: %v", gone)
	}
	mo.mustStatus(404, "DELETE", "/api/comments/"+byMo, nil)
	mo.mustStatus(404, "PUT", "/api/comments/"+byMo, map[string]string{"body_html": "<p>too late</p>"})

	// The post's author may delete any comment on their post; the owner any comment at all.
	kit.mustStatus(200, "DELETE", "/api/comments/"+comment(mo), nil)
	owner.mustStatus(200, "DELETE", "/api/comments/"+comment(mo), nil)

	// What is left is listed and counted.
	keep := comment(mo)
	list := kit.mustStatus(200, "GET", "/api/posts/"+pid+"/comments", nil)["comments"].([]any)
	if len(list) != 1 || list[0].(map[string]any)["id"] != keep {
		t.Fatalf("comments after deletions: %v", list)
	}
	posts := kit.mustStatus(200, "GET", rootPath+"/posts", nil)["posts"].([]any)
	if posts[0].(map[string]any)["comment_count"].(float64) != 1 {
		t.Fatalf("comment_count: %v", posts[0])
	}
	// A comment on a deleted post is already gone.
	kit.mustStatus(200, "DELETE", "/api/posts/"+pid, nil)
	mo.mustStatus(404, "DELETE", "/api/comments/"+keep, nil)
}

func TestPictureChangeIsAnEvent(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	status, img := owner.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d %v", status, img)
	}
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]string{"image_id": img["id"].(string)})
	owner.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": nil})

	rows, err := srv.q().ListEventsSince(context.Background(), store.ListEventsSinceParams{After: 0, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	var pictures []any
	for _, e := range rows {
		if e.Kind != "user" {
			continue
		}
		var u map[string]any
		json.Unmarshal([]byte(e.Payload), &u)
		if u["username"] != "raphael" {
			t.Fatalf("user event payload: %s", e.Payload)
		}
		pictures = append(pictures, u["picture"])
	}
	if len(pictures) != 2 || pictures[0] != img["url"] || pictures[1] != nil {
		t.Fatalf("user events after two picture changes: %v", pictures)
	}
}

// register makes a member and returns their client and id.
func registerMember(t *testing.T, ts *httptest.Server, owner *client, name string) (*client, string) {
	t.Helper()
	inv := owner.mustStatus(201, "POST", "/api/invites", nil)
	c := newClient(t, ts)
	res := c.mustStatus(201, "POST", "/api/register", map[string]string{"code": inv["code"].(string), "username": name, "password": "longenough"})
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

	// Instance-level abilities are the root group's can flags (TestRootGroupAndRoles).

	// A post: its author edits and deletes; the owner deletes only; another member neither.
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

	// A comment by mo on kit's post: mo edits and deletes, kit deletes, the owner deletes.
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

	// A message: its author deletes, the owner deletes, nobody edits.
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
			// The replay is complete; nothing more is coming without another write.
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

	// Two kinds per resource: an edit is another "post" / "comment", not a kind of its own.
	kinds := []string{}
	for _, e := range kit.readEvents(6) {
		if k := e["kind"].(string); k == "post" || k == "comment" {
			kinds = append(kinds, k)
		}
	}
	if strings.Join(kinds, ",") != "post,post,comment,comment" {
		t.Fatalf("event kinds: %v", kinds)
	}

	// The same event carries each viewer's own can flags.
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
	if ownersView["body_html"] != "<p>v1</p>" {
		t.Fatalf("first post event body: %v", ownersView["body_html"])
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
	if n := len(kit.mustStatus(200, "GET", rootPath+"/messages", nil)["messages"].([]any)); n != 0 {
		t.Fatalf("deleted message still listed: %d", n)
	}
	theirs := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>mine</p>"})
	owner.mustStatus(200, "DELETE", "/api/messages/"+theirs["id"].(string), nil)
	events := owner.readEvents(10)
	if e := events[len(events)-1]; e["kind"] != "message_delete" || e["payload"].(map[string]any)["id"] != theirs["id"] {
		t.Fatalf("last event: %v", e)
	}
}

// Every reply to a write, and every event it logs, is the resource exactly
// as a fetch would return it to that viewer. This is the property behind
// "the stream carries the whole thing": a handler must not assemble a
// payload by hand (three bugs came from that: a group without its flags,
// a DM without its people, a membership without its joined time).
func TestRepliesAndEventsMatchTheRow(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")

	// byID finds one item in a listed collection.
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
	// lastEvent is the viewer's newest event of a kind about one thing.
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

	// Posts: created, commented on, edited (the edit carries the live comment count).
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
	// The owner's view of the same post differs from kit's only by its can flags, and the stream agrees with the fetch for them too.
	same("post as the owner", byID(owner.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), byID(owner.mustStatus(200, "GET", rootPath+"/posts", nil), "posts", pid), lastEvent(owner, "post", isID(pid)))

	// Messages.
	msg := kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": "<p>hi</p>"})
	mid := msg["id"].(string)
	same("message", msg, byID(kit.mustStatus(200, "GET", rootPath+"/messages", nil), "messages", mid), lastEvent(kit, "message", isID(mid)))

	// Groups: created, renamed, a member added, promoted, handed to; and a DM, created then found.
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
	// Mo, now owner, sees the group with owner's flags on the stream and on a fetch alike.
	same("group as its new owner", mo.mustStatus(200, "GET", gp, nil), mo.mustStatus(200, "GET", gp, nil), lastEvent(mo, "group", isID(gid)))

	dm := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	did := dm["id"].(string)
	same("created dm", dm, kit.mustStatus(200, "GET", "/api/groups/"+did, nil), lastEvent(kit, "group", isID(did)))
	found := kit.mustStatus(200, "POST", "/api/groups", map[string]any{"kind": "dm", "members": []string{moID}})
	same("found dm", found, kit.mustStatus(200, "GET", "/api/groups/"+did, nil), lastEvent(kit, "group", isID(did)))
	same("dm as mo", mo.mustStatus(200, "GET", "/api/groups/"+did, nil), byID(mo.mustStatus(200, "GET", "/api/groups", nil), "groups", did), lastEvent(mo, "group", isID(did)))
}

// A post has an address of its own (architecture.md, Posts): GET
// /api/posts/{id} is the same post the feed lists, with the viewer's flags;
// a post in a group the viewer is not in, or a deleted one, does not exist to them.
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

	// In a room mo is not in, the post does not exist to mo.
	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	private := kit.mustStatus(201, "POST", "/api/groups/"+room["id"].(string)+"/posts", map[string]string{"body_html": "<p>wool</p>"})
	mo.mustStatus(404, "GET", "/api/posts/"+private["id"].(string), nil)
	kit.mustStatus(200, "GET", "/api/posts/"+private["id"].(string), nil)

	kit.mustStatus(200, "DELETE", "/api/posts/"+pid, nil)
	kit.mustStatus(404, "GET", "/api/posts/"+pid, nil)
	kit.mustStatus(404, "GET", "/api/posts/nothing", nil)
}
