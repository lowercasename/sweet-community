-- 007: a group's one setting, its mode (posts, chat, both); a DM is chat
-- only. And the instance's first setting, who may create groups.
ALTER TABLE groups ADD COLUMN mode TEXT NOT NULL DEFAULT 'both' CHECK (mode IN ('posts', 'chat', 'both'));
UPDATE groups SET mode = 'chat' WHERE kind = 'dm';

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('group_creation', 'anyone');
