-- name: CreateImage :exec
INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetImage :one
SELECT id, uploader_id, content_type, width, height, bytes, created_at FROM images WHERE id = ?;

-- name: SetUserPicture :exec
UPDATE users SET picture_id = ? WHERE id = ?;

-- Images nothing points at: not a profile picture, not in a live post,
-- comment (of a live post) or message. instr() on the id is enough because
-- bodies reference images as /img/<id> and data-image-id="<id>".
-- name: ListUnreferencedImages :many
SELECT i.id, i.content_type FROM images i
WHERE i.created_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.picture_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.deleted_at IS NULL AND instr(p.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
                  WHERE c.deleted_at IS NULL AND instr(c.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.deleted_at IS NULL AND instr(m.body_html, i.id) > 0);

-- name: DeleteImage :exec
DELETE FROM images WHERE id = sqlc.arg(id);
