-- 016: a third kind of notification, mention (architecture.md, Posts,
-- Notifications). SQLite cannot extend a CHECK constraint, so the table is rebuilt.
CREATE TABLE notifications_new (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention')),
    actor_id   TEXT NOT NULL REFERENCES users(id),
    group_id   TEXT NOT NULL REFERENCES groups(id),
    post_id    TEXT REFERENCES posts(id),
    created_at INTEGER NOT NULL,
    read_at    INTEGER
);
INSERT INTO notifications_new SELECT id, user_id, kind, actor_id, group_id, post_id, created_at, read_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user ON notifications(user_id, created_at);
