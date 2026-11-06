-- name: CreateImage :exec
INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetImage :one
SELECT id, uploader_id, content_type, width, height, bytes, created_at FROM images WHERE id = ?;

-- name: SetUserPicture :exec
UPDATE users SET picture_id = ? WHERE id = ?;

-- Can this viewer see this image (architecture.md, Images)? Yes if they
-- uploaded it, if it is anyone's profile picture, if it is the picture of a
-- group they belong to, or if it sits in a live post, comment or message of
-- a group they belong to. instr() on the id is
-- enough because bodies reference images as /img/<id> and data-image-id="<id>".
-- name: ImageVisibleTo :one
SELECT EXISTS (SELECT 1 FROM images i WHERE i.id = sqlc.arg(image_id) AND i.uploader_id = sqlc.arg(viewer_id))
    OR EXISTS (SELECT 1 FROM users u WHERE u.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM groups g JOIN memberships m ON m.group_id = g.id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE g.deleted_at IS NULL AND g.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM posts p JOIN memberships m ON m.group_id = p.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE p.deleted_at IS NULL AND instr(p.body_html, sqlc.arg(image_id)) > 0)
    OR EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
               JOIN memberships m ON m.group_id = p.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE c.deleted_at IS NULL AND instr(c.body_html, sqlc.arg(image_id)) > 0)
    OR EXISTS (SELECT 1 FROM messages x JOIN memberships m ON m.group_id = x.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE x.deleted_at IS NULL AND instr(x.body_html, sqlc.arg(image_id)) > 0) AS visible;

-- Images nothing points at: not a profile picture, not a live group's
-- picture, not in a live post, comment (of a live post) or message of a live group.
-- name: ListUnreferencedImages :many
SELECT i.id, i.content_type FROM images i
WHERE i.created_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.picture_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.picture_id = i.id AND g.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM posts p JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
                  WHERE p.deleted_at IS NULL AND instr(p.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
                  JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
                  WHERE c.deleted_at IS NULL AND instr(c.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM messages x JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL
                  WHERE x.deleted_at IS NULL AND instr(x.body_html, i.id) > 0);

-- name: DeleteImage :exec
DELETE FROM images WHERE id = sqlc.arg(id);
