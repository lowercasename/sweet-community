package images

import (
	"context"
	"database/sql"
	"time"

	"sweet/internal/store"
)

// Sweep deletes images uploaded before `before` that nothing references:
// not a profile picture, not in a live post, comment or message. Uploads
// happen on insert, so a draft that was never posted, an image removed
// while editing, and the pictures of a deleted post all end up here.
// Returns how many were removed. The DB row goes only after the file.
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

// SweepEvery runs Sweep now and then every interval until ctx is done,
// sparing anything younger than grace so a draft in progress keeps its
// pictures. Errors are logged, not fatal: the next run tries again.
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
