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

-- name: GetMarker :one
SELECT user_id, stream, read_at FROM read_markers WHERE user_id = sqlc.arg(user_id) AND stream = sqlc.arg(stream);

-- name: ListMarkers :many
SELECT user_id, stream, read_at FROM read_markers WHERE user_id = sqlc.arg(user_id) ORDER BY stream;
