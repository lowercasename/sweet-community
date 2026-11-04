-- name: CreateImage :exec
INSERT INTO images (id, uploader_id, content_type, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: GetImage :one
SELECT id, uploader_id, content_type, width, height, bytes, created_at FROM images WHERE id = ?;

-- name: SetUserPicture :exec
UPDATE users SET picture_id = ? WHERE id = ?;
