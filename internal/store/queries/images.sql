-- name: CreateImage :exec
INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetImage :one
SELECT id, uploader_id, content_type, width, height, bytes, created_at FROM images WHERE id = ?;

-- name: SetUserPicture :exec
UPDATE users SET picture_id = ? WHERE id = ?;

-- Reports whether a viewer can see an image. The viewer can see it if they uploaded it, if it is any user's profile
-- picture or a link preview's picture, if it is the picture of a group they are in, or if a live post, comment or
-- message in a group they are in uses it. The root group's owner and moderators also see an image in the copy kept
-- by an open report, so they can judge the report. Seeing an image means it exists, because every reference to an
-- image is a foreign key.
-- name: ImageVisibleTo :one
SELECT EXISTS (SELECT 1 FROM images i WHERE i.id = sqlc.arg(image_id) AND i.uploader_id = sqlc.arg(viewer_id))
    OR EXISTS (SELECT 1 FROM users u WHERE u.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM link_previews lp WHERE lp.image_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM groups g JOIN memberships m ON m.group_id = g.id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE g.deleted_at IS NULL AND g.picture_id = sqlc.arg(image_id))
    OR EXISTS (SELECT 1 FROM live_image_uses u JOIN memberships m ON m.group_id = u.group_id AND m.user_id = sqlc.arg(viewer_id) AND m.hidden_at IS NULL
               WHERE u.image_id = sqlc.arg(image_id) AND u.kind != 'report')
    OR EXISTS (SELECT 1 FROM live_image_uses u JOIN groups g ON g.kind = 'root'
               JOIN memberships m ON m.group_id = g.id AND m.user_id = sqlc.arg(viewer_id) AND m.role IN ('owner', 'moderator')
               WHERE u.image_id = sqlc.arg(image_id) AND u.kind = 'report') AS visible;

-- Lists images uploaded before a time that nothing references.
-- name: ListUnreferencedImages :many
SELECT i.id, i.content_type FROM images i
WHERE i.created_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM image_references r WHERE r.image_id = i.id);

-- Deletes an image's row if nothing references the image at this moment. A body saved after the sweep listed the
-- image keeps it. The image's remaining uses, by deleted content, go with it.
-- name: DeleteUnreferencedImage :execrows
DELETE FROM images WHERE id = sqlc.arg(id) AND NOT EXISTS (SELECT 1 FROM image_references r WHERE r.image_id = sqlc.arg(id));

-- name: DeleteImageUses :exec
DELETE FROM image_uses WHERE kind = sqlc.arg(kind) AND id = sqlc.arg(id);

-- Records that a body or a report's copy uses an image, if the image still exists.
-- name: AddImageUse :exec
INSERT OR IGNORE INTO image_uses (image_id, kind, id) SELECT i.id, sqlc.arg(kind), sqlc.arg(id) FROM images i WHERE i.id = sqlc.arg(image_id);

-- name: AddFileToDelete :exec
INSERT OR IGNORE INTO image_files_to_delete (key) VALUES (sqlc.arg(key));

-- name: ListFilesToDelete :many
SELECT key FROM image_files_to_delete;

-- name: RemoveFileToDelete :exec
DELETE FROM image_files_to_delete WHERE key = sqlc.arg(key);
