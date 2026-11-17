-- Existing rooms become open. Direct conversations remain private.
ALTER TABLE groups ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('open', 'private'));
UPDATE groups SET visibility = 'open' WHERE kind IN ('root', 'group');
-- Named rooms provide both posts and chat. Existing content stays in its room.
UPDATE groups SET mode = 'both' WHERE kind = 'group';
-- Replayed group snapshots must not restore an old room mode or omit its audience.
DELETE FROM events WHERE kind IN ('group', 'topic', 'topic_delete');
