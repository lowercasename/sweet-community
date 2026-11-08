-- 014: a profile's bio (architecture.md, Accounts, Profiles). It is the same
-- sanitised HTML as every body, stored with its plain text.
ALTER TABLE users ADD COLUMN bio_html TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio_text TEXT NOT NULL DEFAULT '';
