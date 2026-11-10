-- name: InsertEvent :one
INSERT INTO events (kind, payload, key, created_at) VALUES (?, ?, ?, ?) RETURNING seq;

-- name: ListEventsSince :many
SELECT seq, kind, payload FROM events WHERE seq > sqlc.arg(after) ORDER BY seq LIMIT sqlc.arg(page_size);

-- name: DeleteEventsByKey :exec
-- Deletes every logged event about one resource. Log calls it before it writes the resource's newest event.
DELETE FROM events WHERE key = sqlc.arg(key);

-- name: DeleteEventsBefore :exec
-- Deletes the events older than the replay window.
DELETE FROM events WHERE created_at < sqlc.arg(before);

-- name: ForgetGroupEvents :exec
-- Deletes the logged events of a group's posts, comments, messages, memberships, read markers and notifications.
-- Deleting the group calls it before it deletes them.
DELETE FROM events WHERE key IN (
    SELECT 'post:' || p.id FROM posts p WHERE p.group_id = sqlc.arg(group_id)
    UNION ALL SELECT 'comment:' || c.id FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.group_id = sqlc.arg(group_id)
    UNION ALL SELECT 'message:' || m.id FROM messages m WHERE m.group_id = sqlc.arg(group_id)
    UNION ALL SELECT 'membership:' || ms.group_id || ':' || ms.user_id FROM memberships ms WHERE ms.group_id = sqlc.arg(group_id)
    UNION ALL SELECT 'marker:' || rm.user_id || ':' || rm.stream FROM read_markers rm
        WHERE rm.stream IN ('chat:' || sqlc.arg(group_id), 'feed:' || sqlc.arg(group_id))
    UNION ALL SELECT 'notification:' || n.id FROM notifications n WHERE n.group_id = sqlc.arg(group_id)
);
