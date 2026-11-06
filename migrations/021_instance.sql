-- 021: the instance's own name (architecture.md, New-instance lifecycle,
-- Admin tools): settings rows for name and description, read by everyone
-- and set by the owner; a setup token for a fresh instance that has no
-- owner yet. Invites are many-use for their seven days (a group moves
-- together: Raphael, 2026-11-06), with a count of who came through; and a
-- fourth kind of notification, joined, which the owner gets for each.
INSERT OR IGNORE INTO settings (key, value) VALUES ('name', ''), ('description', '');
ALTER TABLE invites ADD COLUMN uses INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notifications_new (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention', 'joined')),
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
