-- A search entry is found by its kind and id. The index cannot look these up, so each removal reads the whole index.
-- Deleting a room or a post updated each row in it, and each update read the index once. The first trigger removes a
-- deleted room's entries in one statement. The row triggers skip the rows of a deleted room and the comments of a
-- deleted post, because their entries are already gone.
CREATE TRIGGER groups_search_delete AFTER UPDATE OF deleted_at ON groups
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
    DELETE FROM search WHERE group_id = NEW.id;
END;

DROP TRIGGER posts_search_update;
CREATE TRIGGER posts_search_update AFTER UPDATE ON posts
WHEN NOT EXISTS (SELECT 1 FROM groups g WHERE g.id = NEW.group_id AND g.deleted_at IS NOT NULL)
BEGIN
    DELETE FROM search WHERE kind = 'post' AND id = NEW.id;
    DELETE FROM search WHERE kind = 'comment' AND post_id = NEW.id AND NEW.deleted_at IS NOT NULL;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;

DROP TRIGGER comments_search_update;
CREATE TRIGGER comments_search_update AFTER UPDATE ON comments
WHEN NOT EXISTS (SELECT 1 FROM posts p JOIN groups g ON g.id = p.group_id
                 WHERE p.id = NEW.post_id AND (p.deleted_at IS NOT NULL OR g.deleted_at IS NOT NULL))
BEGIN
    DELETE FROM search WHERE kind = 'comment' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id AND NEW.deleted_at IS NULL;
END;

DROP TRIGGER messages_search_update;
CREATE TRIGGER messages_search_update AFTER UPDATE ON messages
WHEN NOT EXISTS (SELECT 1 FROM groups g WHERE g.id = NEW.group_id AND g.deleted_at IS NOT NULL)
BEGIN
    DELETE FROM search WHERE kind = 'message' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;
