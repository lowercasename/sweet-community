-- Groups and memberships (architecture.md, Groups). Roles live here, not
-- on users. Who may do what is perm's call; the queries do not check.

-- name: GetGroup :one
SELECT id, kind, name, created_at FROM groups WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: GetMembership :one
SELECT role FROM memberships WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: ListMyGroups :many
SELECT g.id, g.kind, g.name, g.created_at, m.role
FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND g.deleted_at IS NULL
ORDER BY g.kind = 'root' DESC, g.created_at;

-- name: ListMyGroupIDs :many
SELECT m.group_id FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND g.deleted_at IS NULL;

-- name: ListMembers :many
SELECT u.id, u.username, u.picture_id, m.role, m.joined_at
FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id)
ORDER BY m.role = 'owner' DESC, m.role = 'moderator' DESC, m.joined_at;

-- name: CreateGroup :exec
INSERT INTO groups (id, kind, name, created_at) VALUES (sqlc.arg(id), sqlc.arg(kind), sqlc.arg(name), sqlc.arg(created_at));

-- name: RenameGroup :exec
UPDATE groups SET name = sqlc.arg(name) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeleteGroup :exec
UPDATE groups SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: CreateMembership :exec
INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(joined_at));

-- name: SetMembershipRole :exec
UPDATE memberships SET role = sqlc.arg(role) WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: DeleteMembership :execrows
DELETE FROM memberships WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- The viewer's DMs with their member ids, for find-or-create in Go.
-- name: ListMyDMMembers :many
SELECT g.id AS group_id, m2.user_id
FROM memberships m JOIN groups g ON g.id = m.group_id JOIN memberships m2 ON m2.group_id = g.id
WHERE m.user_id = sqlc.arg(user_id) AND g.kind = 'dm' AND g.deleted_at IS NULL
ORDER BY g.id;
