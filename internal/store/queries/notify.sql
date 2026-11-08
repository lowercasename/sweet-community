-- What reaches a person away from the app (architecture.md, Notifications):
-- their own settings, the weekly digest's counts, and the devices they
-- asked to be notified on.

-- name: GetUserSetting :one
SELECT value FROM user_settings WHERE user_id = sqlc.arg(user_id) AND key = sqlc.arg(key);

-- name: SetUserSetting :exec
INSERT INTO user_settings (user_id, key, value) VALUES (sqlc.arg(user_id), sqlc.arg(key), sqlc.arg(value))
ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value;

-- name: ListDigestCandidates :many
-- Who may be due a digest: in the community, a verified address, the digest
-- not turned off, not seen for a while and not written to for a while. The
-- handler decides the rest. since is where their feed reading stands, or
-- the last digest if that is later, so a week's counts are never repeated.
SELECT u.id, u.username, CAST(u.email AS TEXT) AS email,
       CAST(COALESCE(u.digest_sent_at, 0) AS INTEGER) AS sent_at,
       CAST(MAX(COALESCE((SELECT r.read_at FROM read_markers r WHERE r.user_id = u.id AND r.stream = 'feed:' || m.group_id), m.joined_at), COALESCE(u.digest_sent_at, 0)) AS INTEGER) AS since
FROM users u
JOIN memberships m ON m.user_id = u.id AND m.group_id = sqlc.arg(root)
LEFT JOIN user_settings st ON st.user_id = u.id AND st.key = 'digest'
WHERE u.removed_at IS NULL AND u.email_verified_at IS NOT NULL AND u.email IS NOT NULL
  AND COALESCE(st.value, 'weekly') != 'off'
  AND COALESCE((SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id), 0) < sqlc.arg(idle_before)
  AND COALESCE(u.digest_sent_at, 0) < sqlc.arg(sent_before)
ORDER BY u.username;

-- name: CountPostsSinceByTopic :many
-- Others' live posts on the community's feed since a time, by topic (NULL for none).
SELECT p.topic_id, COUNT(*) AS n
FROM posts p
WHERE p.group_id = sqlc.arg(root) AND p.deleted_at IS NULL AND p.author_id != sqlc.arg(user_id) AND p.created_at > sqlc.arg(since)
GROUP BY p.topic_id;

-- name: CountRepliesSince :one
-- Others' live comments on the person's posts since a time.
SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
WHERE p.author_id = sqlc.arg(user_id) AND c.author_id != sqlc.arg(user_id) AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND c.created_at > sqlc.arg(since);

-- name: ListJoinedSince :many
-- Who joined the community since a time, other than the person.
SELECT u.username FROM memberships m JOIN users u ON u.id = m.user_id
WHERE m.group_id = sqlc.arg(root) AND m.joined_at > sqlc.arg(since) AND u.removed_at IS NULL AND u.id != sqlc.arg(user_id)
ORDER BY m.joined_at;

-- name: CountConversationsWithNewMessages :one
-- The person's conversations with others' live messages newer than where
-- they have read to (or their joining) and than the last digest.
SELECT COUNT(*) FROM memberships m
JOIN groups g ON g.id = m.group_id AND g.kind = 'dm' AND g.deleted_at IS NULL
LEFT JOIN read_markers r ON r.user_id = m.user_id AND r.stream = 'chat:' || m.group_id
WHERE m.user_id = sqlc.arg(user_id) AND m.hidden_at IS NULL
  AND EXISTS (SELECT 1 FROM messages x WHERE x.group_id = m.group_id AND x.deleted_at IS NULL AND x.author_id != m.user_id
              AND x.created_at > MAX(COALESCE(r.read_at, m.joined_at), sqlc.arg(since)));

-- name: SetDigestSentAt :exec
UPDATE users SET digest_sent_at = sqlc.arg(sent_at) WHERE id = sqlc.arg(id);

-- name: CreatePushSubscription :exec
INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
VALUES (sqlc.arg(id), sqlc.arg(user_id), sqlc.arg(endpoint), sqlc.arg(p256dh), sqlc.arg(auth), sqlc.arg(created_at))
ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;

-- name: DeletePushSubscription :exec
-- A device is dropped by whoever owns it, or by the sender when the push service says it is gone.
DELETE FROM push_subscriptions WHERE endpoint = sqlc.arg(endpoint) AND (sqlc.arg(user_id) = '' OR user_id = sqlc.arg(user_id));

-- name: ListPushSubscriptions :many
SELECT id, user_id, endpoint, p256dh, auth, created_at FROM push_subscriptions WHERE user_id = sqlc.arg(user_id);

-- name: DeleteUserPushSubscriptions :exec
DELETE FROM push_subscriptions WHERE user_id = sqlc.arg(user_id);
