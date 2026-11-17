-- Rooms created before visibility choices were introduced become open.
-- Rooms created afterwards keep the visibility their creator chose.
UPDATE groups SET visibility = 'open'
WHERE kind = 'group' AND created_at <= (
    SELECT applied_at FROM schema_migrations WHERE name = '018_open_rooms.sql'
);

-- Give community members access without adding new sidebar shortcuts or changing existing roles.
INSERT INTO memberships (group_id, user_id, role, joined_at, in_sidebar)
SELECT g.id, m.user_id, 'member', CAST(unixepoch('subsec') * 1000 AS INTEGER), 0
FROM groups g JOIN memberships m ON m.group_id = '00000000-0000-7000-8000-000000000000'
JOIN users u ON u.id = m.user_id AND u.removed_at IS NULL
WHERE g.kind = 'group' AND g.deleted_at IS NULL AND g.created_at <= (
    SELECT applied_at FROM schema_migrations WHERE name = '018_open_rooms.sql'
)
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Replayed snapshots must not restore the old audience on rooms or their posts.
DELETE FROM events
WHERE (kind = 'group' AND json_extract(payload, '$.id') IN (
    SELECT id FROM groups WHERE kind = 'group' AND created_at <= (
        SELECT applied_at FROM schema_migrations WHERE name = '018_open_rooms.sql'
    )
)) OR (kind = 'post' AND json_extract(payload, '$.group_id') IN (
    SELECT id FROM groups WHERE kind = 'group' AND created_at <= (
        SELECT applied_at FROM schema_migrations WHERE name = '018_open_rooms.sql'
    )
));
