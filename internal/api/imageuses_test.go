package api

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"sweet/internal/db"
	"sweet/internal/images"
)

func imgTag(img map[string]any) string {
	return `<img src="` + img["url"].(string) + `" alt="" width="40" height="40" data-image-id="` + img["id"].(string) + `">`
}

// The text of the error for a body that uses an image its writer may not use. It does not say whether the image exists.
const imageUnavailable = "One of the images is no longer available. Remove it and try again."

// A body's images are the images in its <img> elements. An image's id written as text, or an image's address in a
// link, gives no access to the image. Anyone who has seen an image knows its id, because it is in its address.
func TestAnImageIdAsTextGivesNoAccess(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	url, id := img["url"].(string), img["id"].(string)
	gid := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private"})["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": imgTag(img)})
	mo.mustStatus(404, "GET", url, nil)
	kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{
		"body_html": `<p>` + id + ` <a href="` + url + `">` + url + `</a></p>`,
	})
	kit.mustStatus(201, "POST", rootPath+"/messages", map[string]string{"body_html": `<p>` + id + `</p>`})
	mo.mustStatus(404, "GET", url, nil)
}

// A post, comment or message may use an image that its writer uploaded or can already see. An image from a room the
// writer is not in, or an image that no longer exists, is refused, and nothing is saved.
func TestABodyUsesOnlyImagesItsWriterCanUse(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	gid := kit.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private"})["id"].(string)
	kit.mustStatus(201, "POST", "/api/groups/"+gid+"/posts", map[string]string{"body_html": imgTag(img)})

	post := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>hello</p>"})
	pid := post["id"].(string)
	refused := func(method, path string) {
		t.Helper()
		status, body := mo.do(method, path, map[string]string{"body_html": "<p>look</p>" + imgTag(img)})
		if status != http.StatusUnprocessableEntity || body["error"] != imageUnavailable {
			t.Fatalf("%s %s: %d %v, want 422 %q", method, path, status, body, imageUnavailable)
		}
	}
	refused("POST", rootPath+"/posts")
	refused("PUT", "/api/posts/"+pid)
	refused("POST", "/api/posts/"+pid+"/comments")
	refused("POST", rootPath+"/messages")
	if got := mo.mustStatus(200, "GET", "/api/posts/"+pid, nil)["body_html"]; got != "<p>hello</p>" {
		t.Fatalf("the refused edit changed the post: %v", got)
	}

	// Once kit posts the image on Home, mo can see it, and so can use it.
	kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(img)})
	mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(img)})

	// An image deleted by the sweep, such as one in a draft left open for more than a day, is refused.
	status, gone := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	if _, err := images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1); err != nil {
		t.Fatal(err)
	}
	status, body := kit.do("POST", rootPath+"/posts", map[string]string{"body_html": imgTag(gone)})
	if status != http.StatusUnprocessableEntity || body["error"] != imageUnavailable {
		t.Fatalf("a swept image: %d %v", status, body)
	}
}

// An edit that removes an image ends the access that the post gave. The sweep then removes the image.
func TestRemovingAnImageFromAPostEndsItsUse(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	url := img["url"].(string)
	pid := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>a</p>" + imgTag(img)})["id"].(string)
	mo.mustStatus(200, "GET", url, nil)
	kit.mustStatus(200, "PUT", "/api/posts/"+pid, map[string]string{"body_html": "<p>a</p>"})
	mo.mustStatus(404, "GET", url, nil)
	if n, err := images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1); err != nil || n != 1 {
		t.Fatalf("sweep: %d %v", n, err)
	}
}

// The sweep deletes an image's row only if nothing uses the image at that moment. A post saved after the sweep listed
// the image keeps it.
func TestTheSweepDeletesAnImageOnlyIfNothingUsesItThen(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	_ = ts
	status, img := owner.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(img)})
	n, err := srv.q().DeleteUnreferencedImage(context.Background(), img["id"].(string))
	if err != nil || n != 0 {
		t.Fatalf("deleted %d rows of an image in a live post: %v", n, err)
	}
}

// A writer may keep an image in their own post when the post is what lets them see it. The edit once failed after
// the image's uploader deleted their own post.
func TestAnAuthorCanEditAPostThatShowsAnImageOnlyItShows(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	kits := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(img)})
	mos := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>this</p>" + imgTag(img)})
	kit.mustStatus(200, "DELETE", "/api/posts/"+kits["id"].(string), nil)
	got := mo.mustStatus(200, "PUT", "/api/posts/"+mos["id"].(string), map[string]string{"body_html": "<p>this one</p>" + imgTag(img)})
	if !strings.Contains(got["body_html"].(string), img["url"].(string)) {
		t.Fatalf("the edit lost the image: %v", got["body_html"])
	}
}
