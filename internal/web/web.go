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
	files := http.FS(sub)
	fileServer := http.FileServer(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean(r.URL.Path)
		if p != "/" {
			if f, err := files.Open(strings.TrimPrefix(p, "/")); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// Serve index.html for any path that is not a file.
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
