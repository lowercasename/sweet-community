package api

import (
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
	"strings"
	"testing"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
)

// newTestServer boots a real server on a temp-file database with the owner
// signed in. Each client has its own cookie jar, so tests can act as
// several people at once.
func newTestServer(t *testing.T) (*httptest.Server, *client) {
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
	return ts, owner
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
	for _, p := range []string{"/api/me", "/api/posts", "/api/messages", "/api/users", "/api/invites"} {
		anon.mustStatus(401, "GET", p, nil)
	}
	anon.mustStatus(401, "POST", "/api/posts", map[string]string{"body_html": "<p>hi</p>"})
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
	if reg["user"].(map[string]any)["role"] != "member" || reg["token"] == "" {
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

	post := owner.mustStatus(201, "POST", "/api/posts", map[string]string{"body_html": "<p>mine</p>"})
	if post["author"].(map[string]any)["username"] != "raphael" {
		t.Fatalf("author: %v", post)
	}
	id := post["id"].(string)
	kit.mustStatus(404, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>not yours</p>"})
	edited := owner.mustStatus(200, "PUT", "/api/posts/"+id, map[string]string{"body_html": "<p>still mine</p>"})
	if edited["body_html"] != "<p>still mine</p>" {
		t.Fatalf("edit: %v", edited)
	}

	msg := kit.mustStatus(201, "POST", "/api/messages", map[string]string{"body_html": "<p>hello</p>"})
	if msg["author"].(map[string]any)["username"] != "kit" {
		t.Fatalf("message author: %v", msg)
	}
	posts := kit.mustStatus(200, "GET", "/api/posts", nil)
	if n := len(posts["posts"].([]any)); n != 1 {
		t.Fatalf("posts visible to a member: %d", n)
	}
}

func TestCrossSiteWritesAreRefused(t *testing.T) {
	_, owner := newTestServer(t)
	status, _ := owner.do("POST", "/api/posts", map[string]string{"body_html": "<p>x</p>"}, "Origin", "https://evil.example")
	if status != 403 {
		t.Fatalf("foreign Origin: want 403, got %d", status)
	}
	status, _ = owner.do("POST", "/api/posts", map[string]string{"body_html": "<p>x</p>"}, "Sec-Fetch-Site", "cross-site")
	if status != 403 {
		t.Fatalf("Sec-Fetch-Site cross-site: want 403, got %d", status)
	}
	// Same-origin and no-Origin (curl, the app shell) are fine.
	status, _ = owner.do("POST", "/api/posts", map[string]string{"body_html": "<p>x</p>"}, "Origin", owner.base)
	if status != 201 {
		t.Fatalf("same Origin: want 201, got %d", status)
	}
	owner.mustStatus(201, "POST", "/api/posts", map[string]string{"body_html": "<p>x</p>"})
	// Reads are never blocked.
	status, _ = owner.do("GET", "/api/posts", nil, "Origin", "https://evil.example")
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

	post := owner.mustStatus(201, "POST", "/api/posts", map[string]string{"body_html": "<p>a question</p>"})
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
	posts := kit.mustStatus(200, "GET", "/api/posts", nil)["posts"].([]any)
	if posts[0].(map[string]any)["comment_count"].(float64) != 2 {
		t.Fatalf("comment_count after two comments: %v", posts[0])
	}

	// Author-only edit, same 404 for someone else's.
	owner.mustStatus(404, "PUT", "/api/comments/"+cid, map[string]string{"body_html": "<p>not yours</p>"})
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
	post := owner.mustStatus(201, "POST", "/api/posts", map[string]string{
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
