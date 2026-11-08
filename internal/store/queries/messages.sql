-- Chat messages belong to a group's chat. The handler checks membership.

-- name: ListMessages :many
SELECT m.id, m.group_id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id
FROM messages m JOIN users u ON u.id = m.author_id
WHERE m.group_id = sqlc.arg(group_id) AND m.deleted_at IS NULL AND m.created_at < sqlc.arg(before)
ORDER BY m.created_at DESC, m.id DESC
LIMIT sqlc.arg(page_size);

-- name: GetMessage :one
SELECT m.id, m.group_id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id
FROM messages m JOIN users u ON u.id = m.author_id
WHERE m.id = sqlc.arg(id) AND m.deleted_at IS NULL;

-- name: CreateMessage :exec
INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at)
VALUES (sqlc.arg(id), sqlc.arg(group_id), sqlc.arg(author_id), sqlc.arg(body_html), sqlc.arg(body_text), sqlc.arg(created_at));

-- name: GetMessageOwners :one
SELECT m.author_id, m.group_id FROM messages m JOIN groups g ON g.id = m.group_id
WHERE m.id = sqlc.arg(id) AND m.deleted_at IS NULL AND g.deleted_at IS NULL;

-- name: DeleteMessage :exec
UPDATE messages SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;
