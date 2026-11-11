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
-- Deletes a comment and empties its text. The row stays, so the rows that point at it stay valid.
UPDATE comments SET deleted_at = sqlc.arg(deleted_at), body_html = '', body_text = ''
WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeletePostComments :exec
-- Deletes the live comments of a post and empties their text.
UPDATE comments SET deleted_at = sqlc.arg(deleted_at), body_html = '', body_text = ''
WHERE post_id = sqlc.arg(post_id) AND deleted_at IS NULL;

-- name: DeleteGroupComments :exec
-- Deletes the live comments on every post of a group and empties their text.
UPDATE comments SET deleted_at = sqlc.arg(deleted_at), body_html = '', body_text = ''
WHERE deleted_at IS NULL AND post_id IN (SELECT id FROM posts WHERE group_id = sqlc.arg(group_id));

-- name: ListLiveCommentsByAuthor :many
-- A user's comments that are not deleted and are on posts that are not deleted, for the delete events when the user
-- is removed.
SELECT c.id, c.post_id, p.group_id FROM comments c JOIN posts p ON p.id = c.post_id
WHERE c.author_id = sqlc.arg(author_id) AND c.deleted_at IS NULL AND p.deleted_at IS NULL;

-- name: EraseAuthorComments :exec
-- Deletes and empties the comments of a removed user that eraseContent did not delete, such as comments deleted before.
-- Rows that are already deleted and empty are not updated again.
UPDATE comments SET deleted_at = COALESCE(deleted_at, sqlc.arg(deleted_at)), body_html = '', body_text = ''
WHERE author_id = sqlc.arg(author_id) AND (deleted_at IS NULL OR body_html != '' OR body_text != '');
