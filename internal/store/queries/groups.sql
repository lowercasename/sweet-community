-- Groups and memberships. Roles are stored on
-- memberships, not on users. perm decides who can do what. The queries do
-- not check permissions.

-- name: GetGroup :one
SELECT g.id, g.kind, g.name, g.mode, g.created_at, g.picture_id,
       (SELECT MAX(created_at) FROM messages WHERE group_id = g.id AND deleted_at IS NULL AND kind = 'message') AS last_message_at
FROM groups g WHERE g.id = sqlc.arg(id) AND g.deleted_at IS NULL;

-- name: GetMembership :one
-- A user's membership of a group. For a room it is the row. For a
-- conversation it is the row while the user has not hidden it.
SELECT role, joined_at FROM memberships WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id) AND hidden_at IS NULL;

-- name: ListMyGroups :many
-- Every group the user has a row in, including conversations they have
-- hidden. It returns hidden_at so the client can tell them apart.
SELECT g.id, g.kind, g.name, g.mode, g.created_at, g.picture_id, m.role, m.hidden_at,
       (SELECT MAX(created_at) FROM messages WHERE group_id = g.id AND deleted_at IS NULL AND kind = 'message') AS last_message_at
FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND g.deleted_at IS NULL
ORDER BY g.kind = 'root' DESC, g.created_at;

-- name: ListMyGroupIDs :many
SELECT m.group_id FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.hidden_at IS NULL AND g.deleted_at IS NULL;

-- name: GetMember :one
SELECT u.id, u.username, u.picture_id, m.role, m.joined_at, m.hidden_at
FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id) AND m.user_id = sqlc.arg(user_id);

-- name: ListMembers :many
-- A group's members. For a room these are its members. For a conversation
-- these are all its users, whether or not some of them have hidden it.
SELECT u.id, u.username, u.picture_id, m.role, m.joined_at, m.hidden_at
FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(group_id)
ORDER BY m.role = 'owner' DESC, m.role = 'moderator' DESC, m.joined_at;

-- name: CreateGroup :exec
INSERT INTO groups (id, kind, name, mode, created_at, people_key)
VALUES (sqlc.arg(id), sqlc.arg(kind), sqlc.arg(name), sqlc.arg(mode), sqlc.arg(created_at), sqlc.arg(people_key));

-- name: GetDMByPeople :one
-- The conversation with exactly these users, found by its people_key. It
-- returns the same columns as GetGroup.
SELECT g.id, g.kind, g.name, g.mode, g.created_at, g.picture_id,
       (SELECT MAX(created_at) FROM messages WHERE group_id = g.id AND deleted_at IS NULL AND kind = 'message') AS last_message_at
FROM groups g WHERE g.kind = 'dm' AND g.people_key = sqlc.arg(people_key) AND g.deleted_at IS NULL;

-- name: UpdateGroup :exec
UPDATE groups SET name = sqlc.arg(name), mode = sqlc.arg(mode) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: SetGroupPicture :exec
UPDATE groups SET picture_id = sqlc.arg(picture_id) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: ListUserMemberships :many
-- Every live group a user is in, with their role and the group's kind.
SELECT m.group_id, m.role, g.kind FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND g.deleted_at IS NULL;

-- name: NextOwner :one
-- Succession by seniority. The next owner is the
-- longest-serving moderator, or else the longest-serving member.
SELECT user_id FROM memberships WHERE group_id = sqlc.arg(group_id) AND user_id != sqlc.arg(user_id)
ORDER BY role = 'moderator' DESC, joined_at ASC LIMIT 1;

-- name: CountMembers :one
SELECT COUNT(*) FROM memberships WHERE group_id = sqlc.arg(group_id) AND hidden_at IS NULL;

-- name: DeleteGroup :exec
UPDATE groups SET deleted_at = sqlc.arg(deleted_at) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: CreateMembership :exec
INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (sqlc.arg(group_id), sqlc.arg(user_id), sqlc.arg(role), sqlc.arg(joined_at));

-- name: SetMembershipRole :exec
UPDATE memberships SET role = sqlc.arg(role) WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: DeleteMembership :execrows
DELETE FROM memberships WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: HideMembership :exec
-- Hiding a conversation keeps the row and sets hidden_at.
UPDATE memberships SET hidden_at = sqlc.arg(hidden_at) WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: ShowMembership :exec
UPDATE memberships SET hidden_at = NULL WHERE group_id = sqlc.arg(group_id) AND user_id = sqlc.arg(user_id);

-- name: GetGroupOwnerID :one
SELECT user_id FROM memberships WHERE group_id = sqlc.arg(group_id) AND role = 'owner';
