-- name: ListMessages :many
SELECT m.id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.role AS author_role
FROM messages m JOIN users u ON u.id = m.author_id
WHERE m.deleted_at IS NULL AND m.created_at < sqlc.arg(before)
ORDER BY m.created_at DESC, m.id DESC
LIMIT sqlc.arg(page_size);

-- name: CreateMessage :exec
INSERT INTO messages (id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?);
