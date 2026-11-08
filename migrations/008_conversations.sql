-- 008: a conversation (kind dm) belongs to a fixed set of users, with one
-- conversation per set (architecture.md, Groups). Its people_key is the set,
-- as the sorted user ids joined by commas. Each user's presence is left_at.
-- It is null while they are in the conversation and set when they have left
-- it. A room never sets left_at. Leaving a room removes the row.
ALTER TABLE memberships ADD COLUMN left_at INTEGER;
ALTER TABLE groups ADD COLUMN people_key TEXT;

UPDATE groups SET people_key = (
    SELECT group_concat(user_id, ',') FROM (SELECT user_id FROM memberships WHERE group_id = groups.id ORDER BY user_id)
) WHERE kind = 'dm' AND deleted_at IS NULL;

-- Before this, two conversations with the same users could exist. The newest
-- keeps the people_key. The others are deleted.
UPDATE groups SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, people_key = NULL
WHERE kind = 'dm' AND deleted_at IS NULL AND people_key IS NOT NULL
  AND id < (SELECT MAX(g2.id) FROM groups g2 WHERE g2.kind = 'dm' AND g2.deleted_at IS NULL AND g2.people_key = groups.people_key);

CREATE UNIQUE INDEX groups_people_key ON groups(people_key) WHERE people_key IS NOT NULL;
