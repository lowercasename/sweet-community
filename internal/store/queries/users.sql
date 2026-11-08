-- name: GetUserByUsername :one
SELECT id, username, password_hash, picture_id, email, email_verified_at, removed_at FROM users WHERE username = ?;

-- name: GetUserPasswordHash :one
SELECT id, password_hash FROM users WHERE username = ?;

-- name: GetUser :one
SELECT id, username, picture_id, removed_at FROM users WHERE id = ?;

-- name: RemoveUser :exec
-- Anonymises a user (architecture.md, Admin tools). The username becomes
-- removed-<id prefix>, and the password, picture and bio are cleared. The row
-- and the id stay so that the user's content keeps its author.
UPDATE users SET username = sqlc.arg(username), password_hash = NULL, picture_id = NULL, bio_html = '', bio_text = '', removed_at = sqlc.arg(removed_at)
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
-- A sign-in token also stores the hashes of its code and of the requesting browser's cookie. A verify token has neither.
INSERT INTO email_tokens (hash, user_id, kind, email, code_hash, request_hash, created_at, expires_at)
VALUES (sqlc.arg(hash), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(email), sqlc.arg(code_hash), sqlc.arg(request_hash), sqlc.arg(created_at), sqlc.arg(expires_at));

-- name: ListSigninTokensForRequest :many
-- The usable sign-in tokens that one browser asked for, newest first.
SELECT hash, user_id, email, code_hash FROM email_tokens
WHERE kind = 'signin' AND request_hash = sqlc.arg(request_hash) AND used_at IS NULL AND expires_at > sqlc.arg(now)
ORDER BY created_at DESC;

-- name: GetRequestUser :one
-- The account of the newest sign-in token that one browser asked for, used or not. Changing the address after joining
-- uses it, so the browser that joined is the one that can change it.
SELECT u.id, u.email_verified_at, u.removed_at FROM email_tokens t JOIN users u ON u.id = t.user_id
WHERE t.kind = 'signin' AND t.request_hash = sqlc.arg(request_hash) AND t.expires_at > sqlc.arg(now)
ORDER BY t.created_at DESC LIMIT 1;

-- name: AddWrongCode :exec
-- Counts a wrong code against a token. The fifth wrong code voids it.
UPDATE email_tokens SET attempts = attempts + 1,
    used_at = CASE WHEN attempts + 1 >= sqlc.arg(max_attempts) THEN sqlc.arg(now) ELSE used_at END
WHERE hash = sqlc.arg(hash);

-- name: CountWrongCodesSince :one
-- The wrong codes entered for a user's sign-in tokens since a time.
SELECT CAST(COALESCE(SUM(attempts), 0) AS INTEGER) FROM email_tokens
WHERE user_id = sqlc.arg(user_id) AND kind = 'signin' AND created_at > sqlc.arg(since);

-- name: VoidUserTokensOfKind :exec
-- Marks a user's unused tokens of one kind as used. A newer address replaces the older address's links. The rows stay,
-- so they still count towards the emails sent in the last hour.
UPDATE email_tokens SET used_at = sqlc.arg(now) WHERE user_id = sqlc.arg(user_id) AND kind = sqlc.arg(kind) AND used_at IS NULL;

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

-- name: DeleteUserEmailTokens :exec
-- Deletes every email link of a user. Removal calls it, so a link sent before the removal cannot sign the account in.
DELETE FROM email_tokens WHERE user_id = sqlc.arg(user_id);

-- name: SetUserEmailVerifiedAt :exec
-- Marks the account's current address verified. Completing a sign-in by email does this.
UPDATE users SET email_verified_at = sqlc.arg(verified_at) WHERE id = sqlc.arg(id) AND email_verified_at IS NULL;
