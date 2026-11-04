package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/images"
	"sweet/internal/store"
)

// Image is the wire shape of an upload; the body references it by url.
type Image struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int64  `json:"width"`
	Height int64  `json:"height"`
}

func imageURL(id string) string { return "/img/" + id }

// pictureURL turns a nullable picture_id into the Avatar's url, or nil for the donut.
func pictureURL(id sql.NullString) *string {
	if !id.Valid {
		return nil
	}
	u := imageURL(id.String)
	return &u
}

// uploadImage takes multipart field "file", processes it and stores it.
func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	if s.Images == nil {
		writeErr(w, http.StatusNotImplemented, "image storage is not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, images.MaxUpload+64<<10)
	file, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "send the image as multipart field \"file\"")
		return
	}
	defer file.Close()
	p, err := images.Process(file)
	switch {
	case errors.Is(err, images.ErrNotImage), errors.Is(err, images.ErrTooLarge):
		writeErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	case err != nil:
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	id, err := uuid.NewV7()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	key := id.String() + "." + p.Ext
	if err := s.Images.Put(r.Context(), key, p.ContentType, bytesReader(p.Data), int64(len(p.Data))); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	me, _ := userFrom(r.Context())
	if err := s.q().CreateImage(r.Context(), store.CreateImageParams{
		ID: id.String(), UploaderID: me.ID, ContentType: p.ContentType,
		Width: int64(p.Width), Height: int64(p.Height), Bytes: int64(len(p.Data)), CreatedAt: db.Now(),
	}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, Image{ID: id.String(), URL: imageURL(id.String()), Width: int64(p.Width), Height: int64(p.Height)})
}

// serveImage streams a stored image to a signed-in member. Ids are unique
// forever, so the browser may cache for a year.
func (s *Server) serveImage(w http.ResponseWriter, r *http.Request) {
	if s.Images == nil {
		http.NotFound(w, r)
		return
	}
	id := r.PathValue("id")
	img, err := s.q().GetImage(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// CanSee for images (architecture.md, Images): the uploader, a profile
	// picture, or a live body in one of the viewer's groups references it.
	me, _ := userFrom(r.Context())
	visible, err := s.q().ImageVisibleTo(r.Context(), store.ImageVisibleToParams{ImageID: id, ViewerID: me.ID})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !(visible.Valid && visible.Bool) {
		http.NotFound(w, r)
		return
	}
	rc, err := s.Images.Get(r.Context(), id+"."+images.Ext(img.ContentType))
	if errors.Is(err, images.ErrNotFound) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", img.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(img.Bytes, 10))
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	io.Copy(w, rc)
}

// setPicture points the signed-in person's avatar at an uploaded image; a
// null image_id goes back to the donut.
func (s *Server) setPicture(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ImageID *string `json:"image_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request body")
		return
	}
	me, _ := userFrom(r.Context())
	// A "user" event carries the whole user, so every open page can redraw
	// their avatar wherever it appears.
	s.logged(w, r, "user", db.Now(), func(qtx *store.Queries) (any, int, error) {
		var pic sql.NullString
		if in.ImageID != nil {
			if _, err := qtx.GetImage(r.Context(), *in.ImageID); errors.Is(err, sql.ErrNoRows) {
				return nil, http.StatusNotFound, errors.New("no such image")
			} else if err != nil {
				return nil, http.StatusInternalServerError, err
			}
			pic = sql.NullString{String: *in.ImageID, Valid: true}
		}
		if err := qtx.SetUserPicture(r.Context(), store.SetUserPictureParams{PictureID: pic, ID: me.ID}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		me.Picture = pictureURL(pic)
		return me, http.StatusOK, nil
	})
}
