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

-- name: GetProfileByUsername :one
-- A person as their profile shows them: who they are, their standing in the
-- root group, and their bio. A removed account has no profile.
SELECT u.id, u.username, u.picture_id, u.bio_html, m.role, m.joined_at
FROM users u JOIN memberships m ON m.user_id = u.id AND m.group_id = '00000000-0000-7000-8000-000000000000'
WHERE u.username = sqlc.arg(username) AND u.removed_at IS NULL;

-- name: GetProfile :one
SELECT u.id, u.username, u.picture_id, u.bio_html, m.role, m.joined_at
FROM users u JOIN memberships m ON m.user_id = u.id AND m.group_id = '00000000-0000-7000-8000-000000000000'
WHERE u.id = sqlc.arg(id) AND u.removed_at IS NULL;

-- name: SetUserBio :exec
UPDATE users SET bio_html = sqlc.arg(bio_html), bio_text = sqlc.arg(bio_text) WHERE id = sqlc.arg(id);
