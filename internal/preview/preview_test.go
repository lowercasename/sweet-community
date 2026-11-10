package preview

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A page's preview comes from its OpenGraph tags. Twitter's tags, the <title> and the meta description fill gaps. A
// relative picture address is resolved against the page. The card shows the page's domain, not a name the page
// chooses, so no site name is read.
func TestParse(t *testing.T) {
	page := `<!doctype html><html><head>
		<title>Fallback title</title>
		<meta name="description" content="Fallback description">
		<meta property="og:title" content="  The allotment open day  ">
		<meta property="og:site_name" content="Not used">
		<meta property="og:image" content="/images/beans.jpg">
		<meta name="twitter:description" content="Bring a trowel.">
		</head><body><meta property="og:title" content="Not in the head"></body></html>`
	p, err := parse(strings.NewReader(page), "https://www.example.org/news/open-day")
	if err != nil {
		t.Fatal(err)
	}
	want := Preview{
		URL:         "https://www.example.org/news/open-day",
		Title:       "The allotment open day",
		Description: "Bring a trowel.",
		ImageURL:    "https://www.example.org/images/beans.jpg",
	}
	if p != want {
		t.Fatalf("got %+v\nwant %+v", p, want)
	}

	p, err = parse(strings.NewReader(`<head><title>Only a title</title></head>`), "https://plots.test/")
	if err != nil || p.Title != "Only a title" || p.ImageURL != "" {
		t.Fatalf("title only: %+v %v", p, err)
	}

	long := strings.Repeat("a", 500)
	p, _ = parse(strings.NewReader(`<meta property="og:title" content="`+long+`"><meta property="og:description" content="`+long+`">`), "https://plots.test/")
	if len([]rune(p.Title)) != maxTitle || len([]rune(p.Description)) != maxDescription {
		t.Fatalf("caps: title %d, description %d", len([]rune(p.Title)), len([]rune(p.Description)))
	}

	// A page with no OpenGraph or Twitter picture, such as Google's homepage, may give a schema.org image.
	p, _ = parse(strings.NewReader(`<head><title>Google</title><meta content="/images/g.png" itemprop="image"></head>`), "https://www.google.com/")
	if p.ImageURL != "https://www.google.com/images/g.png" {
		t.Fatalf("schema.org image: %+v", p)
	}

	if _, err := parse(strings.NewReader(`<meta property="og:description" content="No title">`), "https://plots.test/"); !errors.Is(err, ErrNoPreview) {
		t.Fatalf("no title: %v", err)
	}
}

// Fetch reads a page over HTTP. A page that is not HTML gives no preview.
func TestFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/file.pdf" {
			w.Header().Set("Content-Type", "application/pdf")
			w.Write([]byte("%PDF"))
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<head><meta property="og:title" content="Seed swap"><meta property="og:image" content="pic.png"></head>`))
	}))
	defer srv.Close()

	p, err := Fetch(context.Background(), srv.Client(), srv.URL+"/events/swap")
	if err != nil {
		t.Fatal(err)
	}
	if p.Title != "Seed swap" || p.ImageURL != srv.URL+"/events/pic.png" {
		t.Fatalf("fetched: %+v", p)
	}
	if _, err := Fetch(context.Background(), srv.Client(), srv.URL+"/file.pdf"); !errors.Is(err, ErrNoPreview) {
		t.Fatalf("pdf: %v", err)
	}
	if _, err := Fetch(context.Background(), srv.Client(), "ftp://plots.test/"); !errors.Is(err, ErrNoPreview) {
		t.Fatalf("ftp: %v", err)
	}
}

// The client that fetches previews refuses internal addresses, such as the server's own loopback interface, so a
// member cannot make the server fetch something on its own network.
func TestClientRefusesInternalAddresses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<meta property="og:title" content="Inside">`))
	}))
	defer srv.Close()
	if _, err := Fetch(context.Background(), Client(), srv.URL+"/"); err == nil {
		t.Fatal("the client fetched a loopback address")
	}
	for _, u := range []string{"http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.1/"} {
		if _, err := Fetch(context.Background(), Client(), u); err == nil {
			t.Fatalf("the client fetched %s", u)
		}
	}
}
