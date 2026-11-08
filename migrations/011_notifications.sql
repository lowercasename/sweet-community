-- 011: notifications and read markers (architecture.md, Notifications).
-- A notification is one row for one user about one action that affects them,
-- such as a comment on their post or being added to a room. It is written in
-- the same transaction as the action. A marker records how far a user has
-- read a stream, as the newest time they have seen. There is one row per
-- user per stream ('notifications', or 'chat:<group id>'), and it never
-- moves backwards.
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
