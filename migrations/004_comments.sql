-- Flat comments under a post. Quote-replies are a blockquote in the body,
-- not a column: there is no tree.
CREATE TABLE comments (
    id         TEXT PRIMARY KEY,
    post_id    TEXT NOT NULL REFERENCES posts(id),
    author_id  TEXT NOT NULL REFERENCES users(id),
    body_html  TEXT NOT NULL,
    body_text  TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER,
    deleted_at INTEGER
);
CREATE INDEX comments_post_id_created_at ON comments(post_id, created_at);
