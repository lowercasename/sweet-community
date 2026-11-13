package web

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// A file is served as it is. Any other path, a directory included, gets index.html, so a directory is never listed.
func TestServesFilesAndTheAppForEverythingElse(t *testing.T) {
	h := serve(fstest.MapFS{
		"index.html":    {Data: []byte("the app")},
		"assets/app.js": {Data: []byte("the script")},
	})
	for path, want := range map[string]string{
		"/":              "the app",
		"/assets/app.js": "the script",
		"/assets/":       "the app",
		"/assets":        "the app",
		"/r/some-room":   "the app",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		body, _ := io.ReadAll(rec.Result().Body)
		if rec.Code != http.StatusOK || string(body) != want {
			t.Errorf("GET %s: %d %q, want 200 %q", path, rec.Code, body, want)
		}
	}
}

// Built files under /assets/ have a content hash in their names, so a browser may keep them for good. Every other
// response is checked again each time, so a new release loads at once. A missing asset gets the app, which is not
// kept either.
func TestCacheHeaders(t *testing.T) {
	h := serve(fstest.MapFS{
		"index.html":       {Data: []byte("the app")},
		"sw.js":            {Data: []byte("the worker")},
		"assets/app-1a.js": {Data: []byte("the script")},
	})
	for path, want := range map[string]string{
		"/assets/app-1a.js":  "public, max-age=31536000, immutable",
		"/":                  "no-cache",
		"/r/some-room":       "no-cache",
		"/sw.js":             "no-cache",
		"/assets/missing.js": "no-cache",
		"/assets/":           "no-cache",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if got := rec.Header().Get("Cache-Control"); got != want {
			t.Errorf("GET %s: Cache-Control %q, want %q", path, got, want)
		}
	}
}
