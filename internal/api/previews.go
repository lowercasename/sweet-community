package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"sweet/internal/db"
	"sweet/internal/images"
	"sweet/internal/preview"
	"sweet/internal/store"
)

// A page that gave no preview is asked again after a day, in case it was only unavailable.
const previewRetry = 24 * time.Hour

// maxPreviewURL is the longest address that is fetched.
const maxPreviewURL = 2048

// defaultPreviewClient is created once, so its connections are reused.
var defaultPreviewClient = sync.OnceValue(preview.Client)

// linkPreview returns the preview of the link in ?url=. A kept preview is returned as it is. Otherwise the server
// fetches the page, keeps the preview with a copy of its picture, and returns it. A page with no preview gets 404,
// and is kept as such for a day.
func (s *Server) linkPreview(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	u, err := url.Parse(raw)
	if raw == "" || len(raw) > maxPreviewURL || err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		writeErr(w, http.StatusBadRequest, "Send an http or https address as url")
		return
	}
	row, err := s.q().GetLinkPreview(r.Context(), raw)
	kept := err == nil && (row.Found == 1 || db.Now()-row.FetchedAt < previewRetry.Milliseconds())
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !kept {
		me, _ := userFrom(r.Context())
		if !s.previewLimiter.allow(me.ID) {
			writeErr(w, http.StatusTooManyRequests, "Too many link previews at once. Try again in a minute.")
			return
		}
		if row, err = s.fetchPreview(r.Context(), raw, me.ID); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if row.Found != 1 {
		writeErr(w, http.StatusNotFound, "No preview")
		return
	}
	writeJSON(w, http.StatusOK, wireLinkPreview(row))
}

// fetchPreview fetches the page at raw and keeps the result, found or not. A picture that cannot be fetched or read
// leaves the preview without one. The picture's uploader is the user whose request fetched it.
func (s *Server) fetchPreview(ctx context.Context, raw, uploader string) (store.LinkPreview, error) {
	c := s.PreviewClient
	if c == nil {
		c = defaultPreviewClient()
	}
	save := store.SaveLinkPreviewParams{Url: raw, FetchedAt: db.Now()}
	if p, err := preview.Fetch(ctx, c, raw); err == nil {
		save.Found, save.Title, save.Description = 1, p.Title, p.Description
		// A picture counts against the same memory budget as an upload, for the largest picture that is fetched.
		if p.ImageURL != "" && s.Images != nil && uploads.Acquire(ctx, preview.MaxImageBytes) == nil {
			if data, err := preview.FetchImage(ctx, c, p.ImageURL); err == nil {
				if processed, err := images.Process(data); err == nil {
					if img, err := s.storeImage(ctx, processed, uploader); err == nil {
						save.ImageID = sql.NullString{String: img.ID, Valid: true}
					}
				}
			}
			uploads.Release(preview.MaxImageBytes)
		}
	}
	if err := s.q().SaveLinkPreview(ctx, save); err != nil {
		return store.LinkPreview{}, err
	}
	return s.q().GetLinkPreview(ctx, raw)
}
