-- 009: presence in a conversation is hiding it, which is nobody else's
-- business; the column says so (architecture.md, Groups).
ALTER TABLE memberships RENAME COLUMN left_at TO hidden_at;
