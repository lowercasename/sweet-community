-- name: ListComments :many
SELECT c.id, c.post_id, c.body_html, c.body_text, c.created_at, c.edited_at,
       u.id AS author_id, u.username AS author_username, u.role AS author_role
FROM comments c JOIN users u ON u.id = c.author_id
WHERE c.post_id = ? AND c.deleted_at IS NULL
ORDER BY c.created_at, c.id;

-- name: CreateComment :exec
INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?, ?);

-- name: EditOwnComment :one
UPDATE comments SET body_html = ?, body_text = ?, edited_at = ?
WHERE id = ? AND author_id = ? AND deleted_at IS NULL
RETURNING post_id, created_at;

-- name: CountComments :one
SELECT COUNT(*) FROM comments WHERE post_id = ? AND deleted_at IS NULL;
