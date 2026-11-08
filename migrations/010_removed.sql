-- 010: a removed account (architecture.md, Admin tools). The row stays so
-- the user's content keeps its author id. removed_at marks the account as
-- removed, and the name, password and picture are cleared.
ALTER TABLE users ADD COLUMN removed_at INTEGER;
