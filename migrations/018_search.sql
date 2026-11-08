-- 018: search (architecture.md, Search). One FTS5 table indexes the plain
-- text of posts, comments and messages. Triggers on each table keep it in
-- sync. A live row's text is in the index, a deleted row's text is not, and
-- an edit replaces the text. The table stores its own copy of the text
-- instead of reading the source tables as external content, because the
-- source rows are keyed by UUID and have no stable rowid for FTS to
-- reference. This migration backfills the index, because triggers do not.
CREATE VIRTUAL TABLE search USING fts5(
    text,
    kind UNINDEXED,
    id UNINDEXED,
    group_id UNINDEXED,
    post_id UNINDEXED,
    author_id UNINDEXED,
    created_at UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT body_text, 'post', id, group_id, id, author_id, created_at FROM posts WHERE deleted_at IS NULL;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT c.body_text, 'comment', c.id, p.group_id, c.post_id, c.author_id, c.created_at
FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT body_text, 'message', id, group_id, NULL, author_id, created_at FROM messages WHERE deleted_at IS NULL;

CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at);
END;
CREATE TRIGGER posts_search_update AFTER UPDATE ON posts BEGIN
    DELETE FROM search WHERE kind = 'post' AND id = NEW.id;
    DELETE FROM search WHERE kind = 'comment' AND post_id = NEW.id AND NEW.deleted_at IS NOT NULL;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;
CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id;
END;
CREATE TRIGGER comments_search_update AFTER UPDATE ON comments BEGIN
    DELETE FROM search WHERE kind = 'comment' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id AND NEW.deleted_at IS NULL;
END;
CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at);
END;
CREATE TRIGGER messages_search_update AFTER UPDATE ON messages BEGIN
    DELETE FROM search WHERE kind = 'message' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
END;
