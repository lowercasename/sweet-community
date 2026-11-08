-- 012: a conversation has exactly two users (architecture.md, Groups). A
-- group of more than two is a room, with a name. Conversations of three or
-- more users, which were allowed the afternoon before, are deleted. Their
-- people_key is cleared so the unique index covers only live conversations.
UPDATE groups SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, people_key = NULL
WHERE kind = 'dm' AND deleted_at IS NULL
  AND (SELECT COUNT(*) FROM memberships m WHERE m.group_id = groups.id) > 2;
