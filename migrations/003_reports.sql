-- Reports. A member reports a post, comment or message to the community's owner and
-- moderators. A report keeps a copy of the item's body as it was when reported. A user reports an item once.
CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('post', 'comment', 'message')),
    subject_id TEXT NOT NULL,  -- the id of the post, comment or message
    group_id TEXT NOT NULL REFERENCES groups(id),
    post_id TEXT REFERENCES posts(id),  -- the post, for a post or a comment
    author_id TEXT NOT NULL REFERENCES users(id),
    body_html TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    closed_at INTEGER,
    closed_by TEXT REFERENCES users(id),
    outcome TEXT CHECK (outcome IN ('deleted', 'dismissed')),
    UNIQUE (reporter_id, kind, subject_id)
);
CREATE INDEX reports_item ON reports(kind, subject_id);

-- A report notification goes to the owner and each moderator. It names its report. The table is rebuilt because
-- SQLite cannot change a CHECK constraint.
CREATE TABLE notifications_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention', 'joined', 'topic_post', 'message', 'reply', 'report')),
    actor_id TEXT NOT NULL REFERENCES users(id),
    group_id TEXT NOT NULL REFERENCES groups(id),
    post_id TEXT REFERENCES posts(id),
    topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    message_id TEXT REFERENCES messages(id),
    report_id TEXT REFERENCES reports(id)
);
INSERT INTO notifications_new (id, user_id, kind, actor_id, group_id, post_id, topic_id, created_at, read_at, message_id)
SELECT id, user_id, kind, actor_id, group_id, post_id, topic_id, created_at, read_at, message_id FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user ON notifications(user_id, created_at);
