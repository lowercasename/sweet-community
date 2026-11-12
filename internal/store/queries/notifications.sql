-- Notifications are per user. The handler lists only the logged-in user's
-- own notifications. The same applies to markers.

-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, kind, actor_id, group_id, post_id, topic_id, message_id, report_id, created_at, scope)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(actor_id), sqlc.arg(group_id), sqlc.arg(post_id), sqlc.narg(topic_id), sqlc.narg(message_id), sqlc.narg(report_id), sqlc.arg(created_at), sqlc.arg(scope))
ON CONFLICT (user_id, scope) WHERE read_at IS NULL AND scope != '' DO UPDATE SET
 kind = excluded.kind, actor_id = excluded.actor_id, topic_id = excluded.topic_id, message_id = excluded.message_id,
 created_at = excluded.created_at, activity_count = notifications.activity_count + 1;

-- name: GetNotification :one
-- A report notification carries the kind of the reported item.
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.message_id, n.created_at, n.read_at, n.scope, n.activity_count, g.kind AS group_kind,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id, rp.kind AS report_kind
FROM notifications n JOIN users u ON u.id = n.actor_id JOIN groups g ON g.id = n.group_id LEFT JOIN reports rp ON rp.id = n.report_id
WHERE n.id = sqlc.arg(id);

-- name: ReadNotification :exec
-- Opening a notification marks it read once. A second opening keeps the first read_at.
UPDATE notifications SET read_at = sqlc.arg(read_at) WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND read_at IS NULL AND created_at <= sqlc.arg(before) AND (COALESCE(sqlc.narg(revision), 0) = 0 OR activity_count <= sqlc.narg(revision));

-- name: ListNotifications :many
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.message_id, n.created_at, n.read_at, n.scope, n.activity_count, g.kind AS group_kind,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id, rp.kind AS report_kind
FROM notifications n JOIN users u ON u.id = n.actor_id JOIN groups g ON g.id = n.group_id LEFT JOIN reports rp ON rp.id = n.report_id
WHERE n.user_id = sqlc.arg(user_id) AND n.created_at <= sqlc.arg(before)
  AND (n.created_at < sqlc.arg(before) OR n.id < sqlc.arg(before_id))
ORDER BY n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_size);

-- name: GetUnreadNotificationInScope :one
SELECT id FROM notifications WHERE user_id = ? AND scope = ? AND read_at IS NULL;

-- name: ListUnreadNotificationsUpTo :many
SELECT id FROM notifications WHERE user_id = sqlc.arg(user_id) AND read_at IS NULL
AND created_at <= sqlc.arg(before) AND (sqlc.arg(scope) = '' OR scope = sqlc.arg(scope));

-- name: DeleteNotifications :exec
DELETE FROM notifications WHERE user_id = sqlc.arg(user_id) AND created_at <= sqlc.arg(before);

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
       (SELECT COUNT(*) FROM messages x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.kind = 'message' AND x.author_id != m.user_id
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
-- of notifications not yet opened. A post has a row only once the user has a
-- marker for it. Its unread count is other users' live comments since that
-- marker. The post is found by its id, so the query reads only the user's
-- markers and not every post in their rooms.
SELECT u.id AS user_id, CAST('notifications' AS TEXT) AS stream, CAST(0 AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.read_at IS NULL) AS unread
FROM users u
WHERE u.id = sqlc.arg(user_id)
UNION ALL
SELECT m.user_id, CAST('chat:' || m.group_id AS TEXT) AS stream, CAST(COALESCE(r.read_at, m.joined_at) AS INTEGER) AS read_at,
       (SELECT COUNT(*) FROM messages x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.kind = 'message' AND x.author_id != m.user_id
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
WHERE m.user_id = sqlc.arg(user_id) AND m.hidden_at IS NULL
UNION ALL
SELECT r.user_id, r.stream, r.read_at,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.author_id != r.user_id
          AND c.created_at > r.read_at) AS unread
FROM read_markers r JOIN posts p ON p.id = substr(r.stream, 6)
JOIN memberships m ON m.group_id = p.group_id AND m.user_id = r.user_id
WHERE r.user_id = sqlc.arg(user_id) AND r.stream LIKE 'post:%' AND p.deleted_at IS NULL;
