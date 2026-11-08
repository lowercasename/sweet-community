package images

import (
	"context"
	"database/sql"
	"time"

	"sweet/internal/store"
)

// Sweep deletes images uploaded before `before` that nothing references. An
// image is referenced when it is a profile picture or appears in a live post,
// comment or message. An image is stored as soon as it is uploaded, so the
// unreferenced images are those from drafts that were never posted, images
// removed while editing, and images from deleted posts. Sweep returns the
// number of images removed. The database row is deleted only after the file.
func Sweep(ctx context.Context, q *store.Queries, st Store, before int64) (int, error) {
	rows, err := q.ListUnreferencedImages(ctx, before)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, row := range rows {
		if err := st.Delete(ctx, row.ID+"."+Ext(row.ContentType)); err != nil {
			return n, err
		}
		if err := q.DeleteImage(ctx, row.ID); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// SweepEvery runs Sweep immediately and then once per interval until ctx is
// done. Images younger than grace are skipped, so a draft in progress keeps
// its images. Errors are logged and not fatal, and the next run tries again.
func SweepEvery(ctx context.Context, d *sql.DB, st Store, interval, grace time.Duration, logf func(string, ...any)) {
	q := store.New(d)
	run := func() {
		before := time.Now().Add(-grace).UnixMilli()
		n, err := Sweep(ctx, q, st, before)
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
