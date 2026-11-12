-- Group unread activity without changing user content.
ALTER TABLE notifications ADD COLUMN scope TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN activity_count INTEGER NOT NULL DEFAULT 1;
UPDATE notifications SET scope = CASE
    WHEN post_id IS NOT NULL AND kind != 'report' THEN 'post:' || post_id
    WHEN post_id IS NULL AND kind IN ('message', 'mention', 'reply') THEN 'chat:' || group_id
    ELSE '' END;
UPDATE notifications AS n SET read_at = (
    SELECT r.read_at FROM read_markers r WHERE r.user_id = n.user_id AND r.stream = n.scope
) WHERE n.read_at IS NULL AND n.scope != '' AND EXISTS (
    SELECT 1 FROM read_markers r WHERE r.user_id = n.user_id AND r.stream = n.scope AND r.read_at >= n.created_at
);
UPDATE notifications AS n SET activity_count = (
    SELECT COUNT(*) FROM notifications other
    WHERE other.user_id = n.user_id AND other.scope = n.scope AND other.read_at IS NULL
) WHERE n.scope != '' AND n.read_at IS NULL;
DELETE FROM notifications AS n WHERE n.scope != '' AND n.read_at IS NULL AND EXISTS (
    SELECT 1 FROM notifications newer WHERE newer.user_id = n.user_id AND newer.scope = n.scope
    AND newer.read_at IS NULL AND (newer.created_at > n.created_at OR (newer.created_at = n.created_at AND newer.id > n.id))
);
CREATE UNIQUE INDEX notifications_unread_scope ON notifications(user_id, scope) WHERE read_at IS NULL AND scope != '';

CREATE TABLE post_notification_preferences (
    user_id TEXT NOT NULL REFERENCES users(id),
    post_id TEXT NOT NULL REFERENCES posts(id),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    PRIMARY KEY (user_id, post_id)
);
CREATE TABLE room_notification_preferences (
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('all', 'mentions', 'off')),
    PRIMARY KEY (user_id, group_id),
    FOREIGN KEY (group_id, user_id) REFERENCES memberships(group_id, user_id) ON DELETE CASCADE
);

-- Old notification events describe ungrouped rows and the previous clear behaviour.
DELETE FROM events WHERE kind IN ('notification', 'notification_delete')
 OR (kind = 'marker' AND json_extract(payload, '$.stream') = 'notifications');
