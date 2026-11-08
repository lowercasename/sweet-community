-- name: GetUserByUsername :one
SELECT id, username, password_hash, picture_id, email, email_verified_at, removed_at FROM users WHERE username = ?;

-- name: GetUserPasswordHash :one
SELECT id, password_hash FROM users WHERE username = ?;

-- name: GetUser :one
SELECT id, username, picture_id, removed_at FROM users WHERE id = ?;

-- name: RemoveUser :exec
-- Anonymises a user (architecture.md, Admin tools). The username becomes
-- removed-<id prefix>, and the password and picture are cleared. The row and
-- the id stay so that the user's content keeps its author.
UPDATE users SET username = sqlc.arg(username), password_hash = NULL, picture_id = NULL, removed_at = sqlc.arg(removed_at)
WHERE id = sqlc.arg(id);

-- name: CreateUser :exec
INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?);

-- name: SetUserPassword :exec
UPDATE users SET password_hash = ? WHERE id = ?;

-- name: GetProfileByUsername :one
-- A user's profile. It has the user's id, username and picture, their role
-- and joined time in the root group, and their bio. A removed account has no
-- profile.
SELECT u.id, u.username, u.picture_id, u.bio_html, m.role, m.joined_at
FROM users u JOIN memberships m ON m.user_id = u.id AND m.group_id = '00000000-0000-7000-8000-000000000000'
WHERE u.username = sqlc.arg(username) AND u.removed_at IS NULL;

-- name: GetProfile :one
SELECT u.id, u.username, u.picture_id, u.bio_html, m.role, m.joined_at
FROM users u JOIN memberships m ON m.user_id = u.id AND m.group_id = '00000000-0000-7000-8000-000000000000'
WHERE u.id = sqlc.arg(id) AND u.removed_at IS NULL;

-- name: SetUserBio :exec
UPDATE users SET bio_html = sqlc.arg(bio_html), bio_text = sqlc.arg(bio_text) WHERE id = sqlc.arg(id);

-- name: GetUserByEmail :one
SELECT id, username, password_hash, picture_id, email, email_verified_at, removed_at FROM users WHERE lower(email) = lower(sqlc.arg(email));

-- name: GetAccount :one
SELECT id, username, password_hash, email, email_verified_at, pending_email, removed_at FROM users WHERE id = sqlc.arg(id);

-- name: CreateUserWithEmail :exec
INSERT INTO users (id, username, password_hash, email, created_at) VALUES (sqlc.arg(id), sqlc.arg(username), sqlc.arg(password_hash), sqlc.arg(email), sqlc.arg(created_at));

-- name: SetUserEmailVerified :exec
UPDATE users SET email = sqlc.arg(email), email_verified_at = sqlc.arg(verified_at), pending_email = NULL WHERE id = sqlc.arg(id);

-- name: SetUserPendingEmail :exec
UPDATE users SET pending_email = sqlc.arg(pending_email) WHERE id = sqlc.arg(id);

-- name: CreateEmailToken :exec
INSERT INTO email_tokens (hash, user_id, kind, email, created_at, expires_at) VALUES (sqlc.arg(hash), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(email), sqlc.arg(created_at), sqlc.arg(expires_at));

-- name: GetEmailToken :one
SELECT hash, user_id, kind, email, expires_at, used_at FROM email_tokens WHERE hash = sqlc.arg(hash);

-- name: UseEmailToken :execrows
UPDATE email_tokens SET used_at = sqlc.arg(used_at) WHERE hash = sqlc.arg(hash) AND used_at IS NULL AND expires_at > sqlc.arg(now);

-- name: CountRecentEmailTokens :one
SELECT COUNT(*) FROM email_tokens WHERE user_id = sqlc.arg(user_id) AND kind = sqlc.arg(kind) AND created_at > sqlc.arg(since);

-- name: SetUnverifiedEmail :execrows
UPDATE users SET email = sqlc.arg(email) WHERE id = sqlc.arg(id) AND email_verified_at IS NULL;

-- name: RenameUser :exec
UPDATE users SET username = sqlc.arg(username) WHERE id = sqlc.arg(id);
