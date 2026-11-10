-- name: CreateImage :exec
INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetImage :one
SELECT id, uploader_id, content_type, width, height, bytes, created_at FROM images WHERE id = ?;

-- name: SetUserPicture :exec
UPDATE users SET picture_id = ? WHERE id = ?;

-- Reports whether a viewer can see an image. The
-- viewer can see it if they uploaded it, if it is any user's profile picture,
-- if it is the picture of a group they are in, or if it appears in a live
-- post, comment or message in a group they are in. The root group's owner and
-- moderators also see an image in the copy kept by an open report, so they can
-- judge the report. instr() on the id is
-- enough because bodies reference images as /img/<id> and data-image-id="<id>".
-- name: ImageVisibleTo :one
SELECT EXISTS (SELECT 1 FROM images i WHERE i.id = sqlc.arg(image_id) AND i.uploader_id = sqlc.arg(viewer_id))
    OR EXISTS (SELECT 1 FROM users u WHERE u.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM link_previews lp WHERE lp.image_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM groups g JOIN memberships m ON m.group_id = g.id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE g.deleted_at IS NULL AND g.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM posts p JOIN memberships m ON m.group_id = p.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE p.deleted_at IS NULL AND instr(p.body_html, sqlc.arg(image_id)) > 0)
    OR EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
               JOIN memberships m ON m.group_id = p.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE c.deleted_at IS NULL AND instr(c.body_html, sqlc.arg(image_id)) > 0)
    OR EXISTS (SELECT 1 FROM messages x JOIN memberships m ON m.group_id = x.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE x.deleted_at IS NULL AND instr(x.body_html, sqlc.arg(image_id)) > 0)
    OR EXISTS (SELECT 1 FROM reports r JOIN groups g ON g.kind = 'root'
               JOIN memberships m ON m.group_id = g.id AND m.user_id = sqlc.arg(viewer_id) AND m.role IN ('owner', 'moderator')
               WHERE r.closed_at IS NULL AND instr(r.body_html, sqlc.arg(image_id)) > 0) AS visible;

-- Lists images that nothing references. Such an image is not a profile
-- picture, a live group's picture or a link preview's picture. It does not appear in a live post,
-- comment or message in a live group, or in the copy kept by an open report.
-- A comment counts only if its post is live.
-- name: ListUnreferencedImages :many
SELECT i.id, i.content_type FROM images i
WHERE i.created_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.picture_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM link_previews lp WHERE lp.image_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.picture_id = i.id AND g.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM posts p JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
                  WHERE p.deleted_at IS NULL AND instr(p.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
                  JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
                  WHERE c.deleted_at IS NULL AND instr(c.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM messages x JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL
                  WHERE x.deleted_at IS NULL AND instr(x.body_html, i.id) > 0)
  AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.closed_at IS NULL AND instr(r.body_html, i.id) > 0);

-- name: DeleteImage :exec
DELETE FROM images WHERE id = sqlc.arg(id);
