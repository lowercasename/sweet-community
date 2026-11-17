ALTER TABLE memberships ADD COLUMN in_sidebar INTEGER NOT NULL DEFAULT 1 CHECK (in_sidebar IN (0, 1));

-- Preserve existing delivery choices before new room preferences default to mentions.
INSERT INTO room_notification_preferences (user_id, group_id, mode)
SELECT m.user_id, m.group_id, 'all' FROM memberships m JOIN groups g ON g.id = m.group_id
WHERE g.kind = 'group' AND g.deleted_at IS NULL
ON CONFLICT (user_id, group_id) DO NOTHING;
