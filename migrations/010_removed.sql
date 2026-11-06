-- 010: a removed account (architecture.md, Admin tools). The row stays so
-- their content keeps its author id; removed_at says they are gone, and
-- the name, password and picture go with them.
ALTER TABLE users ADD COLUMN removed_at INTEGER;
