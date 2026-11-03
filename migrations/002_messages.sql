-- The one chat room. A message is a short body through the same sanitiser as
-- a post; replies (reply_to) come with their UI, not before.
CREATE TABLE messages (
    id         TEXT PRIMARY KEY,
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX messages_created_at ON messages(created_at DESC);
