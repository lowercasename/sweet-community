-- Notifications are per person; the handler lists the signed-in person's
-- own and nobody else's. Markers likewise.

-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, kind, actor_id, group_id, post_id, topic_id, created_at)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(kind), sqlc.arg(actor_id), sqlc.arg(group_id), sqlc.arg(post_id), sqlc.narg(topic_id), sqlc.arg(created_at));

-- name: GetNotification :one
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.created_at, n.read_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.id = sqlc.arg(id);

-- name: ReadNotification :exec
-- Opening it reads it, once; a second opening keeps the first time.
UPDATE notifications SET read_at = sqlc.arg(read_at) WHERE id = sqlc.arg(id) AND user_id = sqlc.arg(user_id) AND read_at IS NULL;

-- name: ListNotifications :many
SELECT n.id, n.user_id, n.kind, n.group_id, n.post_id, n.topic_id, n.created_at, n.read_at,
       u.id AS actor_id, u.username AS actor_username, u.picture_id AS actor_picture_id
FROM notifications n JOIN users u ON u.id = n.actor_id
WHERE n.user_id = sqlc.arg(user_id) AND n.created_at < sqlc.arg(before)
ORDER BY n.created_at DESC, n.id DESC
LIMIT sqlc.arg(page_size);

-- name: DeleteReadNotifications :exec
-- The ones I have opened, up to a time; an unread one is never cleared.
DELETE FROM notifications WHERE user_id = sqlc.arg(user_id) AND read_at IS NOT NULL AND created_at <= sqlc.arg(before);

-- name: SetMarker :exec
-- Forward only: a stale tab cannot unread what another has read.
INSERT INTO read_markers (user_id, stream, read_at) VALUES (sqlc.arg(user_id), sqlc.arg(stream), sqlc.arg(read_at))
ON CONFLICT (user_id, stream) DO UPDATE SET read_at = MAX(read_at, excluded.read_at);

-- A marker row exists for every stream of mine whether or not I have read
-- anything: the notifications stream (unread only: a notification is read by
-- opening it), and the chat and the feed of every group I am present in. Unread is what is newer than where I
-- have read to: others' live messages or posts since my marker, or since I
-- joined if I never read.

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
-- The notifications row has no marker time: its unread is the rows not yet opened.
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
