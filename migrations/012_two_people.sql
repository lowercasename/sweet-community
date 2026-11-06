-- 012: a conversation is two people (architecture.md, Groups). More than
-- two is a room, with a name. The conversations of three or more that the
-- afternoon before allowed close; their people_key goes with them so the
-- unique index stays true to live conversations.
UPDATE groups SET deleted_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000, people_key = NULL
WHERE kind = 'dm' AND deleted_at IS NULL
  AND (SELECT COUNT(*) FROM memberships m WHERE m.group_id = groups.id) > 2;
