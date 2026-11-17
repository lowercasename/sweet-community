ALTER TABLE memberships ADD COLUMN in_sidebar INTEGER NOT NULL DEFAULT 1 CHECK (in_sidebar IN (0, 1));

-- Preserve existing delivery choices before new room preferences default to mentions.
INSERT INTO room_notification_preferences (user_id, group_id, mode)
SELECT m.user_id, m.group_id, 'all' FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE g.kind = 'group' AND g.deleted_at IS NULL
ON CONFLICT (user_id, group_id) DO NOTHING;

-- Open rooms are available to everyone without adding new sidebar shortcuts.
INSERT INTO memberships (group_id, user_id, role, joined_at, in_sidebar)
SELECT g.id, m.user_id, 'member', CAST(unixepoch('subsec') * 1000 AS INTEGER), 0
FROM groups g JOIN memberships m ON m.group_id = '00000000-0000-7000-8000-000000000000'
WHERE g.kind = 'group' AND g.visibility = 'open' AND g.deleted_at IS NULL
ON CONFLICT (group_id, user_id) DO NOTHING;
