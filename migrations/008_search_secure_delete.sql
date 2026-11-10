-- The search index removes an entry at once when its post, comment or message is deleted or edited. Without this
-- setting, old entries stay in the index until it merges them, and the deleted text can be rebuilt from them.
INSERT INTO search (search, rank) VALUES ('secure-delete', 1);
