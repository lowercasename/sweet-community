-- 001_init: users, posts, event log.
-- All timestamps are Unix milliseconds, UTC. Ids are UUIDv7 strings.

CREATE TABLE users (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at INTEGER NOT NULL
);

CREATE TABLE posts (
    id         TEXT PRIMARY KEY,
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,   -- TipTap HTML after sanitisation and parsing
    body_text  TEXT NOT NULL,   -- plain text, for search and excerpts
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    deleted_at INTEGER
);
CREATE INDEX posts_created_at ON posts(created_at DESC);

-- The event log. seq is assigned inside the write transaction, so it is in
-- commit order. SSE "id:" and ?since= use it.
CREATE TABLE events (
    seq        INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT NOT NULL,
    payload    TEXT NOT NULL,   -- JSON
    created_at INTEGER NOT NULL
);
