-- Notifications are per person; the handler lists the signed-in person's
-- own and nobody else's. Markers likewise.

-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, kind, actor_id, group_id, post_id, created_at)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(actor_id), sqlc.arg(group_id), sqlc.arg(post_id), sqlc.arg(created_at));

-- name: GetNotification :one
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.created_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.id = sqlc.arg(id);

-- name: ListNotifications :many
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.created_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.user_id = sqlc.arg(user_id) AND n.created_at < sqlc.arg(before)
ORDER BY n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_size);

-- name: SetMarker :exec
-- Forward only: a stale tab cannot unread what another has read.
INSERT INTO read_markers (user_id, stream, read_at) VALUES (sqlc.arg(user_id), sqlc.arg(stream), sqlc.arg(read_at))
ON CONFLICT (user_id, stream) DO UPDATE SET read_at = MAX(read_at, excluded.read_at);

-- A marker row exists for every stream of mine whether or not I have read
-- anything: the notifications stream, and the chat of every group I am
-- present in, its chat and its feed. Unread is what is newer than where I
-- have read to: others' live messages or posts since my marker, or since I
-- joined if I never read.

-- name: GetNotificationsMarker :one
SELECT u.id AS user_id, CAST('notifications' AS TEXT) AS stream, CAST(COALESCE(r.read_at, 0) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.created_at > COALESCE(r.read_at, 0)) AS unread
FROM users u LEFT JOIN read_markers r ON r.user_id = u.id AND r.stream = 'notifications'
WHERE u.id = sqlc.arg(user_id);

-- name: GetChatMarker :one
SELECT m.user_id, CAST('chat:' || m.group_id AS TEXT) AS stream, CAST(COALESCE(r.read_at, m.joined_at) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM messages x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.author_id != m.user_id
          AND x.created_at > COALESCE(r.read_at, m.joined_at)) AS unread
FROM memberships m LEFT JOIN read_markers r ON r.user_id = m.user_id AND r.stream = 'chat:' || m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.group_id = sqlc.arg(group_id) AND m.hidden_at IS NULL;

-- name: GetFeedMarker :one
SELECT m.user_id, CAST('feed:' || m.group_id AS TEXT) AS stream, CAST(COALESCE(r.read_at, m.joined_at) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM posts x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.author_id != m.user_id
          AND x.created_at > COALESCE(r.read_at, m.joined_at)) AS unread
FROM memberships m LEFT JOIN read_markers r ON r.user_id = m.user_id AND r.stream = 'feed:' || m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.group_id = sqlc.arg(group_id) AND m.hidden_at IS NULL;

-- name: ListMarkers :many
SELECT u.id AS user_id, CAST('notifications' AS TEXT) AS stream, CAST(COALESCE(r.read_at, 0) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.created_at > COALESCE(r.read_at, 0)) AS unread
FROM users u LEFT JOIN read_markers r ON r.user_id = u.id AND r.stream = 'notifications'
WHERE u.id = sqlc.arg(user_id)
UNION ALL
SELECT m.user_id, CAST('chat:' || m.group_id AS TEXT) AS stream, CAST(COALESCE(r.read_at, m.joined_at) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM messages x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.author_id != m.user_id
          AND x.created_at > COALESCE(r.read_at, m.joined_at)) AS unread
FROM memberships m JOIN groups g ON g.id = m.group_id AND g.deleted_at IS NULL
LEFT JOIN read_markers r ON r.user_id = m.user_id AND r.stream = 'chat:' || m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.hidden_at IS NULL
UNION ALL
SELECT m.user_id, CAST('feed:' || m.group_id AS TEXT) AS stream, CAST(COALESCE(r.read_at, m.joined_at) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM posts x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.author_id != m.user_id
          AND x.created_at > COALESCE(r.read_at, m.joined_at)) AS unread
FROM memberships m JOIN groups g ON g.id = m.group_id AND g.deleted_at IS NULL
LEFT JOIN read_markers r ON r.user_id = m.user_id AND r.stream = 'feed:' || m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.hidden_at IS NULL;
