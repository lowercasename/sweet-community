-- name: InsertEvent :one
INSERT INTO events (kind, payload, created_at) VALUES (?, ?, ?) RETURNING seq;

-- name: ListEventsSince :many
SELECT seq, kind, payload FROM events WHERE seq > sqlc.arg(after) ORDER BY seq LIMIT sqlc.arg(page_size);
