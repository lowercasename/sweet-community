-- A comment belongs to a group through its post. The handler checks
-- membership. perm decides who can edit or delete, after GetCommentOwners.

-- name: ListComments :many
SELECT c.id, c.post_id, c.body_html, c.body_text, c.created_at, c.edited_at, p.author_id AS post_author_id, p.group_id,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id
FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
WHERE c.post_id = sqlc.arg(post_id) AND c.deleted_at IS NULL
ORDER BY c.created_at, c.id;

-- name: GetComment :one
SELECT c.id, c.post_id, c.body_html, c.body_text, c.created_at, c.edited_at, p.author_id AS post_author_id, p.group_id,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id
FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id
WHERE c.id = sqlc.arg(id) AND c.deleted_at IS NULL;

-- name: CreateComment :exec
INSERT INTO comments (id, post_id, author_id, body_html, body_text, created_at)
VALUES (sqlc.arg(id), sqlc.arg(post_id), sqlc.arg(author_id), sqlc.arg(body_html), sqlc.arg(body_text), sqlc.arg(created_at));

-- name: GetCommentOwners :one
SELECT c.post_id, c.author_id, p.author_id AS post_author_id, p.group_id
FROM comments c JOIN posts p ON p.id = c.post_id JOIN groups g ON g.id = p.group_id
WHERE c.id = sqlc.arg(id) AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND g.deleted_at IS NULL;

-- name: EditComment :exec
UPDATE comments SET body_html = sqlc.arg(body_html), body_text = sqlc.arg(body_text), edited_at = sqlc.arg(edited_at)
WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeleteComment :exec
UPDATE comments SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: ListCommentIDsOfPost :many
-- The ids of a post's comments, deleted or not. Deleting the post removes their events from the log.
SELECT id FROM comments WHERE post_id = sqlc.arg(post_id);
