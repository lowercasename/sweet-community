-- name: GetUserByUsername :one
SELECT id, username, role, password_hash, picture_id FROM users WHERE username = ?;

-- name: GetUserPasswordHash :one
SELECT id, password_hash FROM users WHERE username = ?;

-- name: ListUsers :many
SELECT id, username, role, picture_id, created_at FROM users ORDER BY created_at;

-- name: CreateUser :exec
INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?);

-- name: SetUserRole :exec
UPDATE users SET role = ? WHERE id = ?;

-- name: SetUserPassword :exec
UPDATE users SET password_hash = ? WHERE id = ?;

-- name: GetUser :one
SELECT id, username, role, picture_id FROM users WHERE id = ?;
