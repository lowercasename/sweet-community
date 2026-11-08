-- Uploaded images, one row per stored file. Bodies reference them by id in
-- <img src="/img/<id>">. Profile pictures are images too.
CREATE TABLE images (
    id           TEXT PRIMARY KEY,
    uploader_id  TEXT NOT NULL REFERENCES users(id),
    content_type TEXT NOT NULL,   -- image/jpeg or image/png, as stored
    width        INTEGER NOT NULL,
    height       INTEGER NOT NULL,
    bytes        INTEGER NOT NULL,
    created_at   INTEGER NOT NULL
);
ALTER TABLE users ADD COLUMN picture_id TEXT REFERENCES images(id);
