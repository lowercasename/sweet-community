package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"

	"sweet/internal/db"
	"sweet/internal/images"
	"sweet/internal/store"
)

// previewSite serves pages for link previews: one with OpenGraph tags and a picture, one with no title. It counts
// the requests for the first page.
func previewSite(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var fetches atomic.Int32
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/open-day", "/swap":
			fetches.Add(1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(`<head><meta property="og:title" content="Open day"><meta property="og:description" content="Bring a trowel."><meta property="og:image" content="/beans.png"></head>`))
		case "/beans.png":
			w.Header().Set("Content-Type", "image/png")
			w.Write(testPNG(40, 20))
		default:
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(`<p>A page with no title</p>`))
		}
	}))
	t.Cleanup(site.Close)
	return site, &fetches
}

// GET /api/previews?url= returns a link's preview. The first request fetches the page and keeps the preview with a
// copy of its picture. Later requests, by anyone, read the kept preview without fetching the page again. Every
// signed-in user can see the picture, because it comes from a public page. A page with no title gives 404.
func TestLinkPreviews(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	site, fetches := previewSite(t)
	srv.PreviewClient = site.Client()
	ask := func(u string) string { return "/api/previews?url=" + url.QueryEscape(u) }

	p := owner.mustStatus(200, "GET", ask(site.URL+"/open-day"), nil)
	if _, named := p["site_name"]; named || p["url"] != site.URL+"/open-day" || p["title"] != "Open day" || p["description"] != "Bring a trowel." {
		t.Fatalf("preview: %v", p)
	}
	pic, _ := p["image"].(string)
	if status, _ := kit.do("GET", pic, nil); status != 200 {
		t.Fatalf("another member fetching the preview's picture %q: %d", pic, status)
	}
	again := kit.mustStatus(200, "GET", ask(site.URL+"/open-day"), nil)
	if again["image"] != pic || fetches.Load() != 1 {
		t.Fatalf("second request: %v, page fetched %d times", again, fetches.Load())
	}

	owner.mustStatus(404, "GET", ask(site.URL+"/no-title"), nil)
	owner.mustStatus(400, "GET", "/api/previews", nil)
	owner.mustStatus(400, "GET", ask("ftp://plots.test/"), nil)
	if status, _ := newClient(t, ts).do("GET", ask(site.URL+"/open-day"), nil); status != 401 {
		t.Fatalf("anonymous: %d", status)
	}
}

// The image sweep deletes a preview that no live post, comment or message links to, and then its picture. A preview
// that a post links to stays.
func TestSweepKeepsLinkedPreviews(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	_ = ts
	site, _ := previewSite(t)
	srv.PreviewClient = site.Client()
	linked, unlinked := site.URL+"/open-day", site.URL+"/swap"
	owner.mustStatus(200, "GET", "/api/previews?url="+url.QueryEscape(linked), nil)
	gone := owner.mustStatus(200, "GET", "/api/previews?url="+url.QueryEscape(unlinked), nil)
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{
		"body_html": `<p data-embed=""><a href="` + linked + `">` + linked + `</a></p>`,
	})

	q := store.New(srv.DB)
	if _, err := images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1000); err != nil {
		t.Fatal(err)
	}
	if _, err := q.GetLinkPreview(context.Background(), linked); err != nil {
		t.Fatalf("the linked preview was deleted: %v", err)
	}
	if _, err := q.GetLinkPreview(context.Background(), unlinked); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("the unlinked preview was kept: %v", err)
	}
	owner.mustStatus(404, "GET", gone["image"].(string), nil)
}

// A preview stays while a live post, comment or message shows its link as a card. It goes when none does: when the
// card's post is deleted, when an edit removes the card, or when the link is plain. The server records which cards each
// body shows when it is saved. It once searched every body for each preview's address, while it held the database's
// write lock.
func TestPreviewsStayWhileABodyShowsThemAsCards(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	site, _ := previewSite(t)
	srv.PreviewClient = site.Client()
	link := func(n string) string { return site.URL + "/open-day?n=" + n }
	for _, n := range []string{"post", "comment", "message", "deleted", "edited", "plain"} {
		owner.mustStatus(200, "GET", "/api/previews?url="+url.QueryEscape(link(n)), nil)
	}
	card := func(n string) map[string]string {
		return map[string]string{"body_html": `<p data-embed=""><a href="` + link(n) + `">` + link(n) + `</a></p>`}
	}
	post := owner.mustStatus(201, "POST", rootPath+"/posts", card("post"))
	owner.mustStatus(201, "POST", "/api/posts/"+post["id"].(string)+"/comments", card("comment"))
	owner.mustStatus(201, "POST", rootPath+"/messages", card("message"))
	deleted := owner.mustStatus(201, "POST", rootPath+"/posts", card("deleted"))
	owner.mustStatus(200, "DELETE", "/api/posts/"+deleted["id"].(string), nil)
	edited := owner.mustStatus(201, "POST", rootPath+"/posts", card("edited"))
	owner.mustStatus(200, "PUT", "/api/posts/"+edited["id"].(string), map[string]string{"body_html": "<p>no card now</p>"})
	owner.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": `<p><a href="` + link("plain") + `">` + link("plain") + `</a></p>`})

	if _, err := images.Sweep(context.Background(), srv.DB, srv.Images, db.Now()+1000); err != nil {
		t.Fatal(err)
	}
	q := store.New(srv.DB)
	for n, kept := range map[string]bool{"post": true, "comment": true, "message": true, "deleted": false, "edited": false, "plain": false} {
		if _, err := q.GetLinkPreview(context.Background(), link(n)); (err == nil) != kept {
			t.Errorf("the %s preview: kept %v, want %v", n, err == nil, kept)
		}
	}
}
