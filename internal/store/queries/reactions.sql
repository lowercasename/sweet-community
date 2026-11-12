-- A reaction is one user's emoji on one post, comment or message. The handler checks that the user can see the item.

-- name: AddReaction :exec
INSERT INTO reactions (item_id, emoji, user_id, created_at)
VALUES (sqlc.arg(item_id), sqlc.arg(emoji), sqlc.arg(user_id), sqlc.arg(created_at))
ON CONFLICT DO NOTHING;

-- name: RemoveReaction :exec
DELETE FROM reactions WHERE item_id = sqlc.arg(item_id) AND emoji = sqlc.arg(emoji) AND user_id = sqlc.arg(user_id);

-- name: CountOtherReactionEmoji :one
-- The number of different emoji on an item, besides this one.
SELECT COUNT(DISTINCT emoji) FROM reactions WHERE item_id = sqlc.arg(item_id) AND emoji != sqlc.arg(emoji);

-- name: GetReactions :one
-- An item's reactions as [emoji, user id] pairs, oldest first. The post, comment and message queries return the same
-- column, and reactionsOf groups it.
SELECT CAST((SELECT json_group_array(json_array(x.emoji, x.user_id))
             FROM (SELECT emoji, user_id FROM reactions WHERE item_id = sqlc.arg(item_id) ORDER BY rowid) x)
            AS TEXT) AS reactions;

-- name: DeleteReactions :exec
-- Deletes the reactions of an item, and of the comments under it when it is a post.
DELETE FROM reactions
WHERE item_id = sqlc.arg(item_id) OR item_id IN (SELECT id FROM comments WHERE post_id = sqlc.arg(item_id));

-- name: ForgetReactionEvents :exec
-- Deletes the logged reactions events of an item, and of the comments under it when it is a post. The keys are those
-- that events.Key makes.
DELETE FROM events
WHERE key = 'reactions:' || CAST(sqlc.arg(item_id) AS TEXT)
   OR key IN (SELECT 'reactions:' || id FROM comments WHERE post_id = sqlc.arg(item_id));

-- name: DeleteGroupReactions :exec
-- Deletes the reactions on a group's posts, comments and messages. removeGroup calls it.
DELETE FROM reactions WHERE item_id IN (
    SELECT p.id FROM posts p WHERE p.group_id = sqlc.arg(group_id)
    UNION ALL SELECT c.id FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.group_id = sqlc.arg(group_id)
    UNION ALL SELECT m.id FROM messages m WHERE m.group_id = sqlc.arg(group_id)
);

-- name: ForgetUserReactionEvents :exec
-- Deletes snapshots that contain the user's reactions, including reactions withdrawn since the snapshot was saved.
-- Open pages refetch these items after the removal's user event.
DELETE FROM events
WHERE kind IN ('reactions', 'post', 'comment', 'message')
  AND instr(json_extract(payload, '$.reactions'), json_quote(CAST(sqlc.arg(user_id) AS TEXT))) > 0;

-- name: DeleteUserReactions :exec
DELETE FROM reactions WHERE user_id = sqlc.arg(user_id);

-- name: ListFrequentReactions :many
-- The emoji a user reacts with most, at most six, the most used first. Ties go to the one used last.
SELECT emoji FROM reactions WHERE user_id = sqlc.arg(user_id)
GROUP BY emoji ORDER BY COUNT(*) DESC, MAX(rowid) DESC LIMIT 6;
