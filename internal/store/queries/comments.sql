-- name: ListComments :many
SELECT c.id, c.post_id, c.body_html, c.body_text, c.created_at, c.edited_at,
       u.id AS author_id, u.username AS author_username, u.role AS author_role, u.picture_id AS author_picture_id
FROM comments c JOIN users u ON u.id = c.author_id
WHERE c.post_id = ? AND c.deleted_at IS NULL
ORDER BY c.created_at, c.id;

-- name: CreateComment :exec
INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?);

-- Who may edit or delete is perm's call (internal/perm), made by the handler
-- after GetCommentOwners; the queries themselves do not check.
-- name: GetCommentOwners :one
SELECT c.post_id, c.author_id, p.author_id AS post_author_id
FROM comments c JOIN posts p ON p.id = c.post_id
WHERE c.id = sqlc.arg(id) AND c.deleted_at IS NULL AND p.deleted_at IS NULL;

-- name: EditComment :one
UPDATE comments SET body_html = sqlc.arg(body_html), body_text = sqlc.arg(body_text), edited_at = sqlc.arg(edited_at)
WHERE id = sqlc.arg(id) AND deleted_at IS NULL
RETURNING post_id, created_at;

-- name: DeleteComment :exec
UPDATE comments SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: CountComments :one
SELECT COUNT(*) FROM comments WHERE post_id = ? AND deleted_at IS NULL;
