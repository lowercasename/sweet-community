// Package web embeds the built frontend (web/ is built into internal/web/dist)
// and serves it as a single-page app. Unknown paths are served index.html.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

const placeholder = `<!doctype html><meta charset="utf-8"><title>Sweet</title>
<p style="font-family:system-ui,sans-serif;margin:2em">The frontend hasn't been built into this binary. Run <code>make build</code>, or use <code>cd web && pnpm dev</code> against this backend.</p>`

func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		// The binary was built without a frontend (dev-backend). Serve an
		// explanatory page instead of 404 responses.
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte(placeholder))
		})
	}
	return serve(sub)
}

// serve serves the files of the built frontend. Any path that is not a file, a directory included, gets index.html,
// so a directory is never listed. Built files under assets/ have a content hash in their names, so browsers may keep
// them for a year. Every other response is checked again on each use, so a new release loads at once.
func serve(sub fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if info, err := fs.Stat(sub, p); err == nil && !info.IsDir() {
			if strings.HasPrefix(p, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
