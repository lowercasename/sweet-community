-- Gives each author a read position on every live post they wrote and have no position for, at the time of the
-- upgrade. Other users' comments from then on show the unread dot on the post's comments button. Earlier comments do
-- not. The time is in milliseconds since 1970, as the server writes it.
INSERT OR IGNORE INTO read_markers (user_id, stream, read_at)
SELECT author_id, 'post:' || id, CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER)
FROM posts
WHERE deleted_at IS NULL;
