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
