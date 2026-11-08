-- 007: a group's only setting, its mode (posts, chat, both). A DM is chat
-- only. Also the instance's first setting, which controls who can create groups.
ALTER TABLE groups ADD COLUMN mode TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('posts', 'chat', 'both'));
UPDATE groups SET mode = 'chat' WHERE kind = 'dm';

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('group_creation', 'anyone');
