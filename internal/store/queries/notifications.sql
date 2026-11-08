-- Notifications are per user. The handler lists only the logged-in user's
-- own notifications. The same applies to markers.

-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, kind, actor_id, group_id, post_id, topic_id, message_id, created_at)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(actor_id), sqlc.arg(group_id), sqlc.arg(post_id), sqlc.narg(topic_id), sqlc.narg(message_id), sqlc.arg(created_at));

-- name: GetNotification :one
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.message_id, n.created_at, n.read_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.id = sqlc.arg(id);

-- name: ReadNotification :exec
-- Opening a notification marks it read once. A second opening keeps the first read_at.
UPDATE notifications SET read_at = sqlc.arg(read_at) WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND read_at IS NULL;

-- name: ListNotifications :many
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.message_id, n.created_at, n.read_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.user_id = sqlc.arg(user_id) AND n.created_at < sqlc.arg(before)
ORDER BY n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_size);

-- name: CountUnreadNotificationsInGroup :one
-- Counts the unread notifications of one kind for one group. A conversation's
-- message notification is written once and not again until it is read.
SELECT COUNT(*) FROM notifications
WHERE user_id = sqlc.arg(user_id) AND kind = sqlc.arg(kind) AND group_id = sqlc.arg(group_id) AND read_at IS NULL;

-- name: ListUnreadNotificationsInGroupUpTo :many
-- The unread notifications of one kind for one group, up to a time. Reading
-- the group's chat up to that time marks these notifications read.
SELECT id FROM notifications
WHERE user_id = sqlc.arg(user_id) AND kind = sqlc.arg(kind) AND group_id = sqlc.arg(group_id) AND read_at IS NULL AND created_at <= sqlc.arg(before)
ORDER BY created_at;

-- name: DeleteReadNotifications :exec
-- Deletes the user's read notifications up to a time. An unread notification is never cleared.
DELETE FROM notifications WHERE user_id = sqlc.arg(user_id) AND read_at IS NOT NULL AND created_at <= sqlc.arg(before);

-- name: SetMarker :exec
-- A marker only moves forward, so an outdated tab cannot mark unread what another tab has marked read.
INSERT INTO read_markers (user_id, stream, read_at) VALUES (sqlc.arg(user_id), sqlc.arg(stream), sqlc.arg(read_at))
ON CONFLICT (user_id, stream) DO UPDATE SET read_at = MAX(read_at, excluded.read_at);

-- A marker row exists for each of the user's streams, whether or not they
-- have read anything. The streams are the notifications stream and the chat
-- and feed of every group the user is in and has not hidden. The
-- notifications row has only an unread count, because a notification is
-- read by opening it. Unread counts the items newer than the user's read
-- position. These are other users' live messages or posts since the user's
-- marker, or since they joined if they have never read.

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

-- name: GetNotificationsMarker :one
-- Returns only the notifications row, as ListMarkers lists it. It is used
-- when a write elsewhere has marked some notifications read.
SELECT u.id AS user_id, CAST('notifications' AS TEXT) AS stream, CAST(0 AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
FROM users u
WHERE u.id = sqlc.arg(user_id);

-- name: ListMarkers :many
-- The notifications row has no marker time. Its unread count is the number
-- of notifications not yet opened.
SELECT u.id AS user_id, CAST('notifications' AS TEXT) AS stream, CAST(0 AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
FROM users u
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
