package api

import (
	"context"
	"errors"
	"net/http"

	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// errImageUnavailable refuses a body that uses an image its writer may not use. It does not say whether the image
// exists, so it reveals nothing about an image the writer cannot see.
var errImageUnavailable = errors.New("One of the images is no longer available. Remove it and try again.")

// recordUses records the images that a post, comment or message shows and the links it shows as cards, in place of
// those recorded for it before. Each image must be one that its writer uploaded or can already see. Otherwise the
// save is refused. The image may have been deleted while a draft was open, or belong to a room the writer is not in.
// It runs in the save's transaction, so a refusal saves nothing.
func recordUses(ctx context.Context, qtx *store.Queries, kind, id, writer, body string) (int, error) {
	imgs := sanitize.Images(body)
	// The images are checked before the body's old uses are replaced, so an image that the writer sees only through
	// this body can stay in it. The body's group does not change, so this shows the image to no one new.
	for _, img := range imgs {
		visible, err := qtx.ImageVisibleTo(ctx, store.ImageVisibleToParams{ImageID: img, ViewerID: writer})
		if err != nil {
			return http.StatusInternalServerError, err
		}
		if !visible.Bool {
			return http.StatusUnprocessableEntity, errImageUnavailable
		}
	}
	if err := qtx.DeleteImageUses(ctx, store.DeleteImageUsesParams{Kind: kind, ID: id}); err != nil {
		return http.StatusInternalServerError, err
	}
	for _, img := range imgs {
		if err := qtx.AddImageUse(ctx, store.AddImageUseParams{ImageID: img, Kind: kind, ID: id}); err != nil {
			return http.StatusInternalServerError, err
		}
	}
	if err := qtx.DeleteLinkUses(ctx, store.DeleteLinkUsesParams{Kind: kind, ID: id}); err != nil {
		return http.StatusInternalServerError, err
	}
	for _, url := range sanitize.EmbedLinks(body) {
		if err := qtx.AddLinkUse(ctx, store.AddLinkUseParams{Url: url, Kind: kind, ID: id}); err != nil {
			return http.StatusInternalServerError, err
		}
	}
	return http.StatusOK, nil
}
