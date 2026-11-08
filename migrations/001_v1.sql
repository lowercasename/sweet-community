-- The schema of Sweet v1 (architecture.md, Data model notes). Migrations 001 to 028 were squashed into this one file
-- before v1.0.0, so a new instance creates its database in one step. A database that had already run 028_signin.sql
-- is recorded as having run this file instead (db.Migrate). Later migrations follow this one.

-- Tables.
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at INTEGER NOT NULL,
    password_hash TEXT,
    picture_id TEXT REFERENCES images(id),
    removed_at INTEGER,
    bio_html TEXT NOT NULL DEFAULT '',
    bio_text TEXT NOT NULL DEFAULT '',
    email TEXT,
    email_verified_at INTEGER,
    pending_email TEXT,
    digest_sent_at INTEGER
);

CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,  -- JSON
    created_at INTEGER NOT NULL,
    key TEXT
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by TEXT REFERENCES users(id),
    used_at INTEGER,
    uses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    deleted_at INTEGER
);

CREATE TABLE images (
    id TEXT PRIMARY KEY,
    uploader_id TEXT NOT NULL REFERENCES users(id),
    content_type TEXT NOT NULL,  -- image/jpeg or image/png, as stored
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('root', 'group', 'dm')),
    name TEXT NOT NULL DEFAULT '',  -- empty for root and dm
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    mode TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('posts', 'chat', 'both')),
    people_key TEXT,
    picture_id TEXT REFERENCES images(id)
);

CREATE TABLE memberships (
    group_id TEXT NOT NULL REFERENCES groups(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
    joined_at INTEGER NOT NULL,
    hidden_at INTEGER,
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at INTEGER,
    deleted_at INTEGER,
    topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    author_id TEXT NOT NULL REFERENCES users(id),
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    reply_to TEXT REFERENCES messages(id)
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE read_markers (
    user_id TEXT NOT NULL REFERENCES users(id),
    stream TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, stream)
);

CREATE VIRTUAL TABLE search USING fts5(
    text,
    kind UNINDEXED,
    id UNINDEXED,
    group_id UNINDEXED,
    post_id UNINDEXED,
    author_id UNINDEXED,
    created_at UNINDEXED,
    tokenize = 'trigram remove_diacritics 1'
);

CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE topic_follows (
    user_id TEXT NOT NULL REFERENCES users(id),
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE user_settings (
    user_id TEXT NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('comment', 'added', 'mention', 'joined', 'topic_post', 'message', 'reply')),
    actor_id TEXT NOT NULL REFERENCES users(id),
    group_id TEXT NOT NULL REFERENCES groups(id),
    post_id TEXT REFERENCES posts(id),
    topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    message_id TEXT REFERENCES messages(id)
);

CREATE TABLE email_tokens (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CHECK (kind IN ('signin', 'verify')),
    email TEXT NOT NULL,
    code_hash TEXT,
    request_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

-- Indexes.
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX comments_post_id_created_at ON comments(post_id, created_at);
CREATE INDEX memberships_user_id ON memberships(user_id);
CREATE INDEX posts_group_created_at ON posts(group_id, created_at DESC);
CREATE INDEX messages_group_created_at ON messages(group_id, created_at DESC);
CREATE UNIQUE INDEX groups_people_key ON groups(people_key) WHERE people_key IS NOT NULL;
CREATE UNIQUE INDEX users_email ON users(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX topics_name ON topics(lower(name));
CREATE INDEX posts_topic ON posts(topic_id, created_at DESC);
CREATE INDEX topic_follows_topic ON topic_follows(topic_id);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX notifications_user ON notifications(user_id, created_at);
CREATE INDEX events_by_key ON events(key);
CREATE INDEX email_tokens_user ON email_tokens(user_id);
CREATE INDEX email_tokens_request ON email_tokens(request_hash);

-- Triggers that keep the search index in step with posts, comments and messages.
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at);
END;

CREATE TRIGGER posts_search_update AFTER UPDATE ON posts BEGIN
    DELETE FROM search WHERE kind = 'post' AND id = NEW.id;
    DELETE FROM search WHERE kind = 'comment' AND post_id = NEW.id AND NEW.deleted_at IS NOT NULL;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id;
END;

CREATE TRIGGER comments_search_update AFTER UPDATE ON comments BEGIN
    DELETE FROM search WHERE kind = 'comment' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id AND NEW.deleted_at IS NULL;
END;

CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at);
END;

CREATE TRIGGER messages_search_update AFTER UPDATE ON messages BEGIN
    DELETE FROM search WHERE kind = 'message' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;

-- The root group, which is the community itself. It has a fixed id (perm.Root), the only UUID that is not v7.
INSERT INTO groups (id, kind, name, created_at)
VALUES ('00000000-0000-7000-8000-000000000000', 'root', '', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- The community's settings, before the owner names it.
INSERT INTO settings (key, value) VALUES ('group_creation', 'anyone'), ('name', ''), ('description', '');
