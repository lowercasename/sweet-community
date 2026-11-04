-- 006_groups: membership-scoped spaces (architecture.md, Groups). The
-- instance is the root group, which everyone belongs to. Roles move from
-- users to memberships: a person has a role in each group, not a role.
-- The migration runner has foreign keys off for the duration (SQLite's
-- documented procedure for rebuilding a table) and checks them after.

CREATE TABLE groups (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('root', 'group', 'dm')),
    name       TEXT NOT NULL DEFAULT '',   -- empty for root and dm
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE memberships (
    group_id  TEXT NOT NULL REFERENCES groups(id),
    user_id   TEXT NOT NULL REFERENCES users(id),
    role      TEXT NOT NULL CHECK (role IN ('owner', 'moderator', 'member')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX memberships_user_id ON memberships(user_id);

-- The root group has a fixed id (perm.Root), the one UUID that is not v7.
INSERT INTO groups (id, kind, name, created_at)
VALUES ('00000000-0000-7000-8000-000000000000', 'root', '', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- Everyone's instance role becomes their root membership.
INSERT INTO memberships (group_id, user_id, role, joined_at)
SELECT '00000000-0000-7000-8000-000000000000', id, role, created_at FROM users;

ALTER TABLE users DROP COLUMN role;

-- Posts and messages belong to a group. Rebuilt rather than altered so the
-- column can be NOT NULL REFERENCES groups(id).
CREATE TABLE posts_new (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES groups(id),
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    deleted_at INTEGER
);
INSERT INTO posts_new (id, group_id, author_id, body_html, body_text, created_at, edited_at, deleted_at)
SELECT id, '00000000-0000-7000-8000-000000000000', author_id, body_html, body_text, created_at, edited_at, deleted_at FROM posts;
DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;
CREATE INDEX posts_group_created_at ON posts(group_id, created_at DESC);

CREATE TABLE messages_new (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL REFERENCES groups(id),
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
INSERT INTO messages_new (id, group_id, author_id, body_html, body_text, created_at, deleted_at)
SELECT id, '00000000-0000-7000-8000-000000000000', author_id, body_html, body_text, created_at, deleted_at FROM messages;
DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
CREATE INDEX messages_group_created_at ON messages(group_id, created_at DESC);
