-- 008: a conversation (kind dm) is the conversation of a fixed set of people,
-- one per set (architecture.md, Groups). Its people_key is the set: the
-- sorted user ids, joined by commas. Each person's presence is left_at:
-- null while they are in it, set when they have stepped out. A room never
-- sets left_at; leaving a room removes the row.
ALTER TABLE memberships ADD COLUMN left_at INTEGER;
ALTER TABLE groups ADD COLUMN people_key TEXT;

UPDATE groups SET people_key = (
    SELECT group_concat(user_id, ',') FROM (SELECT user_id FROM memberships WHERE group_id = groups.id ORDER BY user_id)
) WHERE kind = 'dm' AND deleted_at IS NULL;

-- Before this, two conversations of the same people could exist. The newest keeps the set; the others close.
UPDATE groups SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, people_key = NULL
WHERE kind = 'dm' AND deleted_at IS NULL AND people_key IS NOT NULL
  AND id < (SELECT MAX(g2.id) FROM groups g2 WHERE g2.kind = 'dm' AND g2.deleted_at IS NULL AND g2.people_key = groups.people_key);

CREATE UNIQUE INDEX groups_people_key ON groups(people_key) WHERE people_key IS NOT NULL;
