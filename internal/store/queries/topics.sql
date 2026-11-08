-- Topics (architecture.md, Topics) are the community's labels for posts.
-- perm decides who can create or change them (root staff). Following a topic
-- is each user's own choice.

-- name: ListTopics :many
SELECT t.id, t.name, t.description, t.created_at,
       (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.deleted_at IS NULL) AS post_count,
       (SELECT COUNT(*) FROM topic_follows f WHERE f.topic_id = t.id) AS follower_count
FROM topics t
ORDER BY lower(t.name), t.id;

-- name: GetTopic :one
SELECT t.id, t.name, t.description, t.created_at,
       (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.deleted_at IS NULL) AS post_count,
       (SELECT COUNT(*) FROM topic_follows f WHERE f.topic_id = t.id) AS follower_count
FROM topics t
WHERE t.id = sqlc.arg(id);

-- name: CreateTopic :exec
INSERT INTO topics (id, name, description, created_at)
VALUES (sqlc.arg(id), sqlc.arg(name), sqlc.arg(description), sqlc.arg(created_at));

-- name: UpdateTopic :exec
UPDATE topics SET name = sqlc.arg(name), description = sqlc.arg(description) WHERE id = sqlc.arg(id);

-- name: DeleteTopic :exec
DELETE FROM topics WHERE id = sqlc.arg(id);

-- name: ClearPostsTopic :exec
-- A deleted topic's posts are kept, with no topic.
UPDATE posts SET topic_id = NULL WHERE topic_id = sqlc.arg(topic_id);

-- name: DeleteTopicFollows :exec
DELETE FROM topic_follows WHERE topic_id = sqlc.arg(topic_id);

-- name: FollowTopic :exec
INSERT OR IGNORE INTO topic_follows (user_id, topic_id, created_at)
VALUES (sqlc.arg(user_id), sqlc.arg(topic_id), sqlc.arg(created_at));

-- name: UnfollowTopic :exec
DELETE FROM topic_follows WHERE user_id = sqlc.arg(user_id) AND topic_id = sqlc.arg(topic_id);

-- name: ListMyTopicFollows :many
SELECT topic_id FROM topic_follows WHERE user_id = sqlc.arg(user_id);

-- name: ListTopicFollowers :many
SELECT user_id FROM topic_follows WHERE topic_id = sqlc.arg(topic_id);

-- name: SetPostTopic :exec
UPDATE posts SET topic_id = sqlc.narg(topic_id) WHERE id = sqlc.arg(id) AND deleted_at IS NULL;
