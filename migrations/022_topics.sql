-- 022: topics (architecture.md, Topics). A label a post can carry, at most
-- one, kept by the community's staff. People follow a topic to be told of
-- new posts in it. A fifth kind of notification, topic_post, carries the
-- topic so the words can name it.
CREATE TABLE topics (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX topics_name ON topics(lower(name));

ALTER TABLE posts ADD COLUMN topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL;
CREATE INDEX posts_topic ON posts(topic_id, created_at DESC);

CREATE TABLE topic_follows (
    user_id    TEXT NOT NULL REFERENCES users(id),
    topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);
CREATE INDEX topic_follows_topic ON topic_follows(topic_id);

CREATE TABLE notifications_new (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention', 'joined', 'topic_post')),
    actor_id   TEXT NOT NULL REFERENCES users(id),
    group_id   TEXT NOT NULL REFERENCES groups(id),
    post_id    TEXT REFERENCES posts(id),
    topic_id   TEXT REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    read_at    INTEGER
);
INSERT INTO notifications_new (id, user_id, kind, actor_id, group_id, post_id, created_at, read_at)
    SELECT id, user_id, kind, actor_id, group_id, post_id, created_at, read_at FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX notifications_user ON notifications(user_id, created_at);
