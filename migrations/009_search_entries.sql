-- The number of each search entry, by the kind and id of the post, comment or message it was made from. The search
-- index can look up an entry by its number but not by its kind and id, so before this table each trigger read the
-- whole index to find one entry. The search triggers below keep this table.
CREATE TABLE search_entries (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    entry INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
) WITHOUT ROWID;

-- The index is rebuilt from the live posts, comments and messages, with the number of each entry. A trigger from an
-- unreleased version of this migration is dropped if it exists.
DROP TRIGGER IF EXISTS groups_search_delete;
DROP TRIGGER posts_search_insert;
DROP TRIGGER posts_search_update;
DROP TRIGGER comments_search_insert;
DROP TRIGGER comments_search_update;
DROP TRIGGER messages_search_insert;
DROP TRIGGER messages_search_update;
DROP TABLE search;
CREATE VIRTUAL TABLE search USING fts5(
    text,
    kind UNINDEXED,
    id UNINDEXED,
    group_id UNINDEXED,
    post_id UNINDEXED,
    author_id UNINDEXED,
    created_at UNINDEXED,
    tokenize = 'trigram remove_diacritics 1'
);
-- See 008_search_secure_delete.sql.
INSERT INTO search (search, rank) VALUES ('secure-delete', 1);

INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT p.body_text, 'post', p.id, p.group_id, p.id, p.author_id, p.created_at
    FROM posts p JOIN live_bodies b ON b.kind = 'post' AND b.id = p.id;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT c.body_text, 'comment', c.id, b.group_id, c.post_id, c.author_id, c.created_at
    FROM comments c JOIN live_bodies b ON b.kind = 'comment' AND b.id = c.id;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT m.body_text, 'message', m.id, m.group_id, NULL, m.author_id, m.created_at
    FROM messages m JOIN live_bodies b ON b.kind = 'message' AND b.id = m.id;
INSERT INTO search_entries (kind, id, entry) SELECT kind, id, rowid FROM search;

-- Each trigger removes the row's entry by its number and adds a new entry while the row is live. Deleting a post also
-- removes the entries of its comments.
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at);
    INSERT INTO search_entries (kind, id, entry) VALUES ('post', NEW.id, last_insert_rowid());
END;

CREATE TRIGGER posts_search_update AFTER UPDATE ON posts BEGIN
    DELETE FROM search WHERE rowid = (SELECT entry FROM search_entries WHERE kind = 'post' AND id = NEW.id);
    DELETE FROM search_entries WHERE kind = 'post' AND id = NEW.id;
    DELETE FROM search WHERE NEW.deleted_at IS NOT NULL AND rowid IN (
        SELECT e.entry FROM comments c JOIN search_entries e ON e.kind = 'comment' AND e.id = c.id WHERE c.post_id = NEW.id);
    DELETE FROM search_entries WHERE NEW.deleted_at IS NOT NULL AND kind = 'comment'
        AND id IN (SELECT id FROM comments WHERE post_id = NEW.id);
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'post', NEW.id, NEW.group_id, NEW.id, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
    INSERT INTO search_entries (kind, id, entry) SELECT 'post', NEW.id, last_insert_rowid() WHERE NEW.deleted_at IS NULL;
END;

CREATE TRIGGER comments_search_insert AFTER INSERT ON comments BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id;
    INSERT INTO search_entries (kind, id, entry)
    SELECT 'comment', NEW.id, last_insert_rowid() WHERE EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id);
END;

CREATE TRIGGER comments_search_update AFTER UPDATE ON comments BEGIN
    DELETE FROM search WHERE rowid = (SELECT entry FROM search_entries WHERE kind = 'comment' AND id = NEW.id);
    DELETE FROM search_entries WHERE kind = 'comment' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'comment', NEW.id, p.group_id, NEW.post_id, NEW.author_id, NEW.created_at FROM posts p WHERE p.id = NEW.post_id AND NEW.deleted_at IS NULL;
    INSERT INTO search_entries (kind, id, entry)
    SELECT 'comment', NEW.id, last_insert_rowid() WHERE NEW.deleted_at IS NULL AND EXISTS (SELECT 1 FROM posts WHERE id = NEW.post_id);
END;

CREATE TRIGGER messages_search_insert AFTER INSERT ON messages BEGIN
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    VALUES (NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at);
    INSERT INTO search_entries (kind, id, entry) VALUES ('message', NEW.id, last_insert_rowid());
END;

CREATE TRIGGER messages_search_update AFTER UPDATE ON messages BEGIN
    DELETE FROM search WHERE rowid = (SELECT entry FROM search_entries WHERE kind = 'message' AND id = NEW.id);
    DELETE FROM search_entries WHERE kind = 'message' AND id = NEW.id;
    INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
    SELECT NEW.body_text, 'message', NEW.id, NEW.group_id, NULL, NEW.author_id, NEW.created_at WHERE NEW.deleted_at IS NULL;
    INSERT INTO search_entries (kind, id, entry) SELECT 'message', NEW.id, last_insert_rowid() WHERE NEW.deleted_at IS NULL;
END;
