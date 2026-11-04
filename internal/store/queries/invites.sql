-- name: CreateInvite :exec
INSERT INTO invites (code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?);

-- name: ListOpenInvites :many
SELECT i.code, i.created_at, i.expires_at,
       u.id AS creator_id, u.username AS creator_username, u.role AS creator_role
FROM invites i JOIN users u ON u.id = i.created_by
WHERE i.used_at IS NULL AND i.expires_at > sqlc.arg(now)
ORDER BY i.created_at DESC;

-- name: DeleteOpenInvite :execrows
DELETE FROM invites WHERE code = ? AND used_at IS NULL;

-- name: GetOpenInviteCreator :one
SELECT u.username FROM invites i JOIN users u ON u.id = i.created_by
WHERE i.code = sqlc.arg(code) AND i.used_at IS NULL AND i.expires_at > sqlc.arg(now);

-- Never mix bare ? with sqlc.arg() in one query: SQLite numbers a bare ?
-- as (highest index so far + 1), so a ? after a named ?3 becomes ?4.
-- name: ClaimInvite :execrows
UPDATE invites SET used_by = sqlc.arg(used_by), used_at = sqlc.arg(used_at)
WHERE code = sqlc.arg(code) AND used_at IS NULL AND expires_at > sqlc.arg(now);
