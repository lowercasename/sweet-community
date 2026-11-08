-- Adds replies to chat messages and the notification kind 'reply'
-- (architecture.md, Chat). A reply points at an earlier message in the same
-- chat. SQLite cannot change a CHECK constraint in place, so the
-- notifications table is rebuilt with its rows and index.
ALTER TABLE messages ADD COLUMN reply_to TEXT REFERENCES messages(id);

CREATE TABLE notifications_new (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention', 'joined', 'topic_post', 'message', 'reply')),
    actor_id   TEXT NOT NULL REFERENCES users(id),
    group_id   TEXT NOT NULL REFERENCES groups(id),
    post_id    TEXT REFERENCES posts(id),
    topic_id   TEXT REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    read_at    INTEGER
);
INSERT INTO notifications_new (id, user_id, kind, actor_id, group_id, post_id, topic_id, created_at, read_at)
    SELECT id, user_id, kind, actor_id, group_id, post_id, topic_id, created_at, read_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user ON notifications(user_id, created_at);
