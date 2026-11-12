-- name: GetPostNotificationPreference :one
SELECT p.id AS post_id, CAST(COALESCE(pref.enabled,
    p.author_id = sqlc.arg(user_id) OR EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = sqlc.arg(user_id))) AS INTEGER) AS enabled, CAST(COALESCE(pref.enabled = 0, 0) AS INTEGER) AS muted
FROM posts p LEFT JOIN post_notification_preferences pref ON pref.post_id = p.id AND pref.user_id = sqlc.arg(user_id)
WHERE p.id = sqlc.arg(post_id);

-- name: SetPostNotificationPreference :exec
INSERT INTO post_notification_preferences (user_id, post_id, enabled) VALUES (?, ?, ?)
ON CONFLICT(user_id, post_id) DO UPDATE SET enabled = excluded.enabled;

-- name: IsPostMuted :one
SELECT EXISTS(SELECT 1 FROM post_notification_preferences WHERE user_id = ? AND post_id = ? AND enabled = 0);

-- name: ListPostFollowers :many
SELECT m.user_id FROM posts p JOIN memberships m ON m.group_id = p.group_id
JOIN users u ON u.id = m.user_id
LEFT JOIN post_notification_preferences pref ON pref.post_id = p.id AND pref.user_id = m.user_id
WHERE p.id = sqlc.arg(post_id) AND u.removed_at IS NULL
AND COALESCE(pref.enabled, p.author_id = m.user_id OR EXISTS (SELECT 1 FROM comments c WHERE c.post_id = p.id AND c.author_id = m.user_id));

-- name: GetRoomNotificationPreference :one
SELECT m.group_id, CAST(COALESCE(pref.mode, 'all') AS TEXT) AS mode
FROM memberships m LEFT JOIN room_notification_preferences pref ON pref.group_id = m.group_id AND pref.user_id = m.user_id
WHERE m.group_id = ? AND m.user_id = ?;

-- name: SetRoomNotificationPreference :exec
INSERT INTO room_notification_preferences (user_id, group_id, mode) VALUES (?, ?, ?)
ON CONFLICT(user_id, group_id) DO UPDATE SET mode = excluded.mode;

-- name: ListUserSettings :many
SELECT key, value FROM user_settings WHERE user_id = ?;

-- name: GetPostMarker :one
-- Without a marker the post has no read position, so nothing in it is unread. A muted discussion has nothing unread.
SELECT u.id AS user_id, CAST('post:' || p.id AS TEXT) AS stream,
CAST(COALESCE(r.read_at, 0) AS INTEGER) AS read_at,
CAST(CASE WHEN r.read_at IS NULL THEN 0 ELSE (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL
    AND c.author_id != u.id AND c.created_at > r.read_at
    AND NOT EXISTS (SELECT 1 FROM post_notification_preferences n WHERE n.user_id = u.id AND n.post_id = p.id AND n.enabled = 0)) END AS INTEGER) AS unread
FROM posts p JOIN users u ON u.id = sqlc.arg(user_id) LEFT JOIN read_markers r ON r.user_id = sqlc.arg(user_id) AND r.stream = 'post:' || p.id
WHERE p.id = sqlc.arg(post_id);

-- name: GetNotificationReportAuthor :one
SELECT r.author_id FROM notifications n JOIN reports r ON r.id = n.report_id
WHERE n.id = ? AND r.closed_at IS NULL;

-- name: GetReadPosition :one
SELECT CAST(COALESCE((SELECT read_at FROM read_markers WHERE user_id = ? AND stream = ?), 0) AS INTEGER);
