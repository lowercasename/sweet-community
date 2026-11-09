-- Posts belong to a group. The handler has already checked the viewer's
-- membership of the group it lists. perm decides who can edit or delete,
-- after GetPostOwners. The queries do not check permissions.

-- name: ListPosts :many
SELECT p.id, p.group_id, p.topic_id, p.body_html, p.body_text, p.created_at, p.edited_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count
FROM posts p JOIN users u ON u.id = p.author_id
WHERE p.group_id = sqlc.arg(group_id) AND p.deleted_at IS NULL AND p.created_at < sqlc.arg(before)
  AND (sqlc.narg(topic_id) IS NULL OR p.topic_id = sqlc.narg(topic_id))
ORDER BY p.created_at DESC, p.id DESC
LIMIT sqlc.arg(page_size);

-- name: GetPost :one
SELECT p.id, p.group_id, p.topic_id, p.body_html, p.body_text, p.created_at, p.edited_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count
FROM posts p JOIN users u ON u.id = p.author_id
WHERE p.id = sqlc.arg(id) AND p.deleted_at IS NULL;

-- name: CreatePost :exec
INSERT INTO posts (id, group_id, author_id, topic_id, body_html, body_text, created_at)
VALUES (sqlc.arg(id), sqlc.arg(group_id), sqlc.arg(author_id), sqlc.narg(topic_id), sqlc.arg(body_html), sqlc.arg(body_text), sqlc.arg(created_at));

-- name: GetPostOwners :one
SELECT p.author_id, p.group_id FROM posts p JOIN groups g ON g.id = p.group_id
WHERE p.id = sqlc.arg(id) AND p.deleted_at IS NULL AND g.deleted_at IS NULL;

-- name: EditPost :exec
UPDATE posts SET body_html = sqlc.arg(body_html), body_text = sqlc.arg(body_text), edited_at = sqlc.arg(edited_at)
WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeletePost :exec
UPDATE posts SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: ListPostsByAuthor :many
-- One user's posts that a viewer can see. Only posts in groups that the
-- viewer is in, and has not hidden, are returned.
SELECT p.id, p.group_id, p.topic_id, p.body_html, p.body_text, p.created_at, p.edited_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count
FROM posts p JOIN users u ON u.id = p.author_id
JOIN memberships v ON v.group_id = p.group_id AND v.user_id = sqlc.arg(viewer_id) AND v.hidden_at IS NULL
JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
WHERE p.author_id = sqlc.arg(author_id) AND p.deleted_at IS NULL AND p.created_at < sqlc.arg(before)
ORDER BY p.created_at DESC, p.id DESC
LIMIT sqlc.arg(page_size);


-- name: ListLivePostsByAuthor :many
-- A user's posts that are not deleted, with their groups, for the delete events when the user is removed.
SELECT id, group_id FROM posts WHERE author_id = sqlc.arg(author_id) AND deleted_at IS NULL;

-- name: EraseAuthorPosts :exec
-- Deletes every post of a removed user and clears its text, including posts deleted before.
UPDATE posts SET deleted_at = COALESCE(deleted_at, sqlc.arg(deleted_at)), body_html = '', body_text = ''
WHERE author_id = sqlc.arg(author_id);
