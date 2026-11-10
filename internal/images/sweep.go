package images

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"sweet/internal/store"
)

// Sweep deletes images uploaded before `before` that nothing references. An image is referenced when it is a
// profile picture, a live group's picture or a link preview's picture, or when a live post, comment or message, or
// an open report's copy, uses it. Link previews that nothing links to any more are deleted first, so their pictures
// go in the same run. An image is stored as soon as it is uploaded, so the unreferenced images are those from drafts
// that were never posted, images removed while editing, and images from deleted content. A failure on one image
// does not stop the others. Sweep returns the number of images removed and every error.
func Sweep(ctx context.Context, d *sql.DB, st Store, before int64) (int, error) {
	q := store.New(d)
	var errs []error
	if _, err := q.DeleteUnusedLinkPreviews(ctx, before); err != nil {
		errs = append(errs, err)
	}
	rows, err := q.ListUnreferencedImages(ctx, before)
	if err != nil {
		return 0, errors.Join(append(errs, err)...)
	}
	n := 0
	for _, row := range rows {
		removed, err := sweepOne(ctx, d, st, row)
		if err != nil {
			errs = append(errs, err)
		}
		if removed {
			n++
		}
	}
	return n, errors.Join(errs...)
}

// sweepOne deletes one image's row and its file in one write transaction. The row is deleted only if nothing has
// started to use the image since the list was made. If the file cannot be deleted, the row is kept, and the next
// run tries again.
func sweepOne(ctx context.Context, d *sql.DB, st Store, row store.ListUnreferencedImagesRow) (bool, error) {
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	deleted, err := store.New(tx).DeleteUnreferencedImage(ctx, row.ID)
	if err != nil || deleted == 0 {
		return false, err
	}
	if err := st.Delete(ctx, row.ID+"."+Ext(row.ContentType)); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

// SweepEvery runs Sweep immediately and then once per interval until ctx is
// done. Images younger than grace are skipped, so a draft in progress keeps
// its images. Errors are logged and not fatal, and the next run tries again.
func SweepEvery(ctx context.Context, d *sql.DB, st Store, interval, grace time.Duration, logf func(string, ...any)) {
	run := func() {
		before := time.Now().Add(-grace).UnixMilli()
		n, err := Sweep(ctx, d, st, before)
		if err != nil {
			logf("image sweep: %v", err)
		} else if n > 0 {
			logf("image sweep: removed %d unreferenced", n)
		}
	}
	run()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
