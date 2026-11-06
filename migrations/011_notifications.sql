-- 011: notifications and read markers (architecture.md, Notifications).
-- A notification is one row for one person about one thing done to them,
-- written in the same transaction as the thing: a comment on their post,
-- being added to a room. A marker is how far along a stream a person has
-- read: the newest time they have seen, one row per person per stream
-- ('notifications', or 'chat:<group id>'), never moved backwards.
CREATE TABLE notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('comment', 'added')),
    actor_id   TEXT NOT NULL REFERENCES users(id),
    group_id   TEXT NOT NULL REFERENCES groups(id),
    post_id    TEXT REFERENCES posts(id),
    created_at INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, created_at);

CREATE TABLE read_markers (
    user_id TEXT NOT NULL REFERENCES users(id),
    stream  TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, stream)
);
