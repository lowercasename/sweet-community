-- 020: search by any part of a word (architecture.md, Search). The index is
-- rebuilt with the trigram tokeniser, so "armalade" finds marmalade; the
-- triggers from 018 stay, they only name the table. Words of fewer than three
-- characters cannot be matched by it; the query drops them.
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

INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT body_text, 'post', id, group_id, id, author_id, created_at FROM posts WHERE deleted_at IS NULL;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT c.body_text, 'comment', c.id, p.group_id, c.post_id, c.author_id, c.created_at
FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.deleted_at IS NULL AND p.deleted_at IS NULL;
INSERT INTO search (text, kind, id, group_id, post_id, author_id, created_at)
SELECT body_text, 'message', id, group_id, NULL, author_id, created_at FROM messages WHERE deleted_at IS NULL;
