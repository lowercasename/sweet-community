-- name: GetUserByUsername :one
SELECT id, username, password_hash, picture_id FROM users WHERE username = ?;

-- name: GetUserPasswordHash :one
SELECT id, password_hash FROM users WHERE username = ?;

-- name: GetUser :one
SELECT id, username, picture_id, removed_at FROM users WHERE id = ?;

-- name: RemoveUser :exec
-- Anonymise (architecture.md, Admin tools): the name becomes removed-<id prefix>,
-- the password and picture go, the row and the id stay for their content.
UPDATE users SET username = sqlc.arg(username), password_hash = NULL, picture_id = NULL, removed_at = sqlc.arg(removed_at)
WHERE id = sqlc.arg(id);

-- name: CreateUser :exec
INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?);

-- name: SetUserPassword :exec
UPDATE users SET password_hash = ? WHERE id = ?;
