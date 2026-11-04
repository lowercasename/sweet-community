-- name: CreateSession :exec
INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?);

-- name: GetSessionUser :one
SELECT u.id, u.username, u.role, u.picture_id, s.last_seen_at
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.id = sqlc.arg(id) AND s.expires_at > sqlc.arg(now);

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE id = ?;

-- name: DeleteUserSessions :exec
DELETE FROM sessions WHERE user_id = ?;
