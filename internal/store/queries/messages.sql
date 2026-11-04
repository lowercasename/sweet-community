-- name: ListMessages :many
SELECT m.id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.role AS author_role, u.picture_id AS author_picture_id
FROM messages m JOIN users u ON u.id = m.author_id
WHERE m.deleted_at IS NULL AND m.created_at < sqlc.arg(before)
ORDER BY m.created_at DESC, m.id DESC
LIMIT sqlc.arg(page_size);

-- name: CreateMessage :exec
INSERT INTO messages (id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?);

-- name: GetMessageAuthor :one
SELECT author_id FROM messages WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeleteMessage :exec
UPDATE messages SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;
