-- The single chat room. A message is a short body that goes through the same
-- sanitiser as a post. Replies (reply_to) will be added with their UI, not before.
CREATE TABLE messages (
    id         TEXT PRIMARY KEY,
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);
CREATE INDEX messages_created_at ON messages(created_at DESC);
