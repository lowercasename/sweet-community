package api

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
)

type pageCursor struct {
	CreatedAt int64
	ID        string
}

// page trims the extra row and returns the last displayed item's position.
func page[T any](items []T, limit int, position func(T) pageCursor) ([]T, *string) {
	if len(items) <= limit {
		return items, nil
	}
	items = items[:limit]
	last := position(items[limit-1])
	next := base64.RawURLEncoding.EncodeToString([]byte(strconv.FormatInt(last.CreatedAt, 10) + ":" + last.ID))
	return items, &next
}

// pageParams reads the cursor for lists ordered by creation time and ID, newest first.
func pageParams(r *http.Request, defaultLimit, maxLimit int) (before pageCursor, limit int, err error) {
	limit = defaultLimit
	if v, e := strconv.Atoi(r.URL.Query().Get("limit")); e == nil && v > 0 && v <= maxLimit {
		limit = v
	}
	before.CreatedAt = 1 << 62
	raw := r.URL.Query().Get("before")
	if raw == "" {
		return before, limit, nil
	}
	invalid := errors.New("Invalid page cursor")
	if len(raw) > 256 {
		return before, limit, invalid
	}
	decoded, e := base64.RawURLEncoding.DecodeString(raw)
	if e != nil {
		return before, limit, invalid
	}
	timestamp, id, found := strings.Cut(string(decoded), ":")
	createdAt, e := strconv.ParseInt(timestamp, 10, 64)
	if !found || e != nil || createdAt < 0 || id == "" {
		return before, limit, invalid
	}
	return pageCursor{CreatedAt: createdAt, ID: id}, limit, nil
}
