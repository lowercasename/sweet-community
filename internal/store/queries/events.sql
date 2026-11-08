-- name: InsertEvent :one
INSERT INTO events (kind, payload, key, created_at) VALUES (?, ?, ?, ?) RETURNING seq;

-- name: ListEventsSince :many
SELECT seq, kind, payload FROM events WHERE seq > sqlc.arg(after) ORDER BY seq LIMIT sqlc.arg(page_size);

-- name: DeleteEventsByKey :exec
-- Deletes every logged event about one resource. Log calls it before it writes the resource's newest event.
DELETE FROM events WHERE key = sqlc.arg(key);

-- name: DeleteEventsBefore :exec
-- Deletes the events older than the replay window.
DELETE FROM events WHERE created_at < sqlc.arg(before);
