package api

import (
	"bytes"
	"context"
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

// Image is the wire shape of an uploaded image. A body references it by URL.
type Image struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Width  int64  `json:"width"`
	Height int64  `json:"height"`
}

func imageURL(id string) string { return "/img/" + id }

// pictureURL converts a nullable picture_id to the picture's URL, or nil when the default donut avatar is shown.
func pictureURL(id sql.NullString) *string {
	if !id.Valid {
		return nil
	}
	u := imageURL(id.String)
	return &u
}

// uploadImage reads the multipart field "file", processes the image and stores it.
func (s *Server) uploadImage(w http.ResponseWriter, r *http.Request) {
	if s.Images == nil {
		writeErr(w, http.StatusNotImplemented, "Image storage is not configured")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, images.MaxUpload+64<<10) // the file and the form around it
	p, err := readImage(r)
	var tooBig *http.MaxBytesError
	switch {
	case errors.As(err, &tooBig):
		writeErr(w, http.StatusRequestEntityTooLarge, images.ErrTooLarge.Error())
		return
	case errors.Is(err, http.ErrMissingFile), errors.Is(err, http.ErrNotMultipart):
		writeErr(w, http.StatusBadRequest, "Choose an image to upload.")
		return
	case errors.Is(err, images.ErrNotImage), errors.Is(err, images.ErrTooLarge):
		writeErr(w, http.StatusUnprocessableEntity, err.Error())
		return
	case err != nil:
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	me, _ := userFrom(r.Context())
	img, err := s.storeImage(r.Context(), p, me.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, img)
}

// readImage reads the form's "file" field and processes it. A file of more than a megabyte is kept in a temporary
// file, so an upload holds no memory while it arrives. The temporary file is deleted here. net/http deletes only the
// files of the request it passed to the first handler, and requireAuth passes a copy.
func readImage(r *http.Request) (images.Processed, error) {
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		return images.Processed{}, err
	}
	defer r.MultipartForm.RemoveAll()
	file, _, err := r.FormFile("file")
	if err != nil {
		return images.Processed{}, err
	}
	defer file.Close()
	return images.Process(file)
}

// storeImage stores a processed image and records it with its uploader. Uploads and the pictures of link previews
// both use it.
func (s *Server) storeImage(ctx context.Context, p images.Processed, uploader string) (Image, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return Image{}, err
	}
	key := id.String() + "." + images.Ext(p.ContentType)
	if err := s.Images.Put(ctx, key, p.ContentType, bytes.NewReader(p.Data), int64(len(p.Data))); err != nil {
		return Image{}, err
	}
	// The file is stored, so its row is written even if the client has gone meanwhile.
	ctx = context.WithoutCancel(ctx)
	if err := s.q().CreateImage(ctx, store.CreateImageParams{
		ID: id.String(), UploaderID: uploader, ContentType: p.ContentType,
		Width: int64(p.Width), Height: int64(p.Height), Bytes: int64(len(p.Data)), CreatedAt: db.Now(),
	}); err != nil {
		// The file has no row, so the image sweep would never find it. It is listed for deletion instead.
		s.q().AddFileToDelete(ctx, key)
		return Image{}, err
	}
	return Image{ID: id.String(), URL: imageURL(id.String()), Width: int64(p.Width), Height: int64(p.Height)}, nil
}

// serveImage streams a stored image to a signed-in member. Ids are never
// reused, so the browser may cache the image for a year.
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
	// ImageVisibleTo holds the visibility rule for images.
	me, _ := userFrom(r.Context())
	visible, err := s.q().ImageVisibleTo(r.Context(), store.ImageVisibleToParams{ImageID: id, ViewerID: me.ID})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !visible.Bool {
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

// pictureImage checks the image that is to become a profile picture or a room picture. A picture must be an image
// that the person setting it uploaded. Every signed-in user can see a profile picture, so any other image would let a
// member show an image from a private room or a conversation to the whole community, or use someone else's picture as
// their own. An image that someone else uploaded gets the same 404 as one that does not exist. A nil id clears the
// picture.
func pictureImage(ctx context.Context, qtx *store.Queries, id *string, setter string) (sql.NullString, int, error) {
	if id == nil {
		return sql.NullString{}, 0, nil
	}
	img, err := qtx.GetImage(ctx, *id)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && img.UploaderID != setter) {
		return sql.NullString{}, http.StatusNotFound, errors.New("No such image")
	}
	if err != nil {
		return sql.NullString{}, http.StatusInternalServerError, err
	}
	return sql.NullString{String: *id, Valid: true}, 0, nil
}

// setPicture sets the signed-in user's picture to an uploaded image. A null image_id resets it to the default donut
// avatar.
func (s *Server) setPicture(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ImageID *string `json:"image_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	me, _ := userFrom(r.Context())
	// A "user" event carries the whole user, so every open page can redraw
	// the user's picture wherever it appears.
	s.logged(w, r, "user", db.Now(), func(qtx *store.Queries) (any, int, error) {
		pic, status, err := pictureImage(r.Context(), qtx, in.ImageID, me.ID)
		if err != nil {
			return nil, status, err
		}
		if err := qtx.SetUserPicture(r.Context(), store.SetUserPictureParams{PictureID: pic, ID: me.ID}); err != nil {
			return nil, http.StatusInternalServerError, err
		}
		return currentUser(r.Context(), qtx, me.ID)
	})
}
