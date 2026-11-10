-- The links that each post, comment and message shows as preview cards, taken from its body when it is saved. The
-- cleanup of unused previews reads this table. Before, it searched every body for each preview's address while it
-- held the database's write lock, and a message sent meanwhile failed.
CREATE TABLE link_uses (
    url TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('post', 'comment', 'message')),
    id TEXT NOT NULL,
    PRIMARY KEY (kind, id, url)
);
CREATE INDEX link_uses_url ON link_uses(url);

-- The cards that count: in a live post, comment or message in a live group.
CREATE VIEW live_link_uses AS
    SELECT u.url FROM link_uses u
        JOIN posts p ON u.kind = 'post' AND p.id = u.id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.url FROM link_uses u
        JOIN comments c ON u.kind = 'comment' AND c.id = u.id AND c.deleted_at IS NULL
        JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.url FROM link_uses u
        JOIN messages x ON u.kind = 'message' AND x.id = u.id AND x.deleted_at IS NULL
        JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL;

-- Stored files whose images have been deleted, waiting to be deleted from storage. The image sweep deletes an image's
-- row in a short transaction and the file afterwards, so it never holds the write lock while it waits on storage. A
-- file that cannot be deleted stays here and is tried again on the next run.
CREATE TABLE image_files_to_delete (
    key TEXT PRIMARY KEY
);

-- Records the cards in the bodies saved before this table existed. A body stores & in an address as &amp;.
INSERT OR IGNORE INTO link_uses (url, kind, id)
    SELECT lp.url, 'post', p.id FROM (SELECT id, body_html FROM posts WHERE instr(body_html, 'data-embed') > 0) p
        JOIN link_previews lp ON instr(p.body_html, 'href="' || replace(lp.url, '&', '&amp;') || '"') > 0;
INSERT OR IGNORE INTO link_uses (url, kind, id)
    SELECT lp.url, 'comment', c.id FROM (SELECT id, body_html FROM comments WHERE instr(body_html, 'data-embed') > 0) c
        JOIN link_previews lp ON instr(c.body_html, 'href="' || replace(lp.url, '&', '&amp;') || '"') > 0;
INSERT OR IGNORE INTO link_uses (url, kind, id)
    SELECT lp.url, 'message', x.id FROM (SELECT id, body_html FROM messages WHERE instr(body_html, 'data-embed') > 0) x
        JOIN link_previews lp ON instr(x.body_html, 'href="' || replace(lp.url, '&', '&amp;') || '"') > 0;
