-- 014: a profile's bio (architecture.md, Accounts, Profiles): the same
-- sanitised HTML as every body, with its plain text beside it.
ALTER TABLE users ADD COLUMN bio_html TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio_text TEXT NOT NULL DEFAULT '';
