-- 009: a user's presence in a conversation is whether they have hidden it,
-- and other users are not shown it. The column is renamed to match
-- (architecture.md, Groups).
ALTER TABLE memberships RENAME COLUMN left_at TO hidden_at;
