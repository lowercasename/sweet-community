-- name: ListPosts :many
SELECT p.id, p.body_html, p.body_text, p.created_at, p.edited_at,
       u.id AS author_id, u.username AS author_username, u.role AS author_role, u.picture_id AS author_picture_id,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count
FROM posts p JOIN users u ON u.id = p.author_id
WHERE p.deleted_at IS NULL AND p.created_at < sqlc.arg(before)
ORDER BY p.created_at DESC, p.id DESC
LIMIT sqlc.arg(page_size);

-- name: CreatePost :exec
INSERT INTO posts (id, author_id, body_html, body_text, created_at) VALUES (?, ?, ?, ?, ?);

-- Who may edit or delete is perm's call (internal/perm), made by the handler
-- after GetPostAuthor; the queries themselves do not check.
-- name: EditPost :one
UPDATE posts SET body_html = sqlc.arg(body_html), body_text = sqlc.arg(body_text), edited_at = sqlc.arg(edited_at)
WHERE id = sqlc.arg(id) AND deleted_at IS NULL
RETURNING created_at;

-- name: PostExists :one
SELECT COUNT(*) FROM posts WHERE id = ? AND deleted_at IS NULL;

-- name: GetPostAuthor :one
SELECT author_id FROM posts WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeletePost :exec
UPDATE posts SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;
