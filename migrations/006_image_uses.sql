-- The images that each post, comment, message and report uses, taken from its <img> elements when it is saved.
-- Image visibility and the image sweep read this table. Before, they searched every body for the image's id, which
-- let an id written as text give access to the image, and grew slower as history grew.
CREATE TABLE image_uses (
    image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('post', 'comment', 'message', 'report')),
    id TEXT NOT NULL,
    PRIMARY KEY (kind, id, image_id)
);
CREATE INDEX image_uses_image ON image_uses(image_id);

-- The uses that count: in a live post, comment or message in a live group, or in the copy kept by an open report.
-- group_id is the group whose members may see the image. For a report it is the reported content's group.
CREATE VIEW live_image_uses AS
    SELECT u.image_id, u.kind, p.group_id FROM image_uses u
        JOIN posts p ON u.kind = 'post' AND p.id = u.id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, p.group_id FROM image_uses u
        JOIN comments c ON u.kind = 'comment' AND c.id = u.id AND c.deleted_at IS NULL
        JOIN posts p ON p.id = c.post_id AND p.deleted_at IS NULL
        JOIN groups g ON g.id = p.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, x.group_id FROM image_uses u
        JOIN messages x ON u.kind = 'message' AND x.id = u.id AND x.deleted_at IS NULL
        JOIN groups g ON g.id = x.group_id AND g.deleted_at IS NULL
    UNION ALL
    SELECT u.image_id, u.kind, r.group_id FROM image_uses u
        JOIN reports r ON u.kind = 'report' AND r.id = u.id AND r.closed_at IS NULL;

-- Every reference that keeps an image: a profile picture, a live group's picture, a link preview's picture, or a
-- live use. The sweep deletes only images that have none.
CREATE VIEW image_references AS
    SELECT picture_id AS image_id FROM users WHERE picture_id IS NOT NULL
    UNION ALL
    SELECT picture_id FROM groups WHERE picture_id IS NOT NULL AND deleted_at IS NULL
    UNION ALL
    SELECT image_id FROM link_previews WHERE image_id IS NOT NULL
    UNION ALL
    SELECT image_id FROM live_image_uses;

-- Records the uses in the bodies saved before this table existed. A body names an image as src="/img/<id>".
INSERT OR IGNORE INTO image_uses (image_id, kind, id)
    SELECT i.id, 'post', p.id FROM (SELECT id, body_html FROM posts WHERE instr(body_html, '<img') > 0) p
        JOIN images i ON instr(p.body_html, 'src="/img/' || i.id || '"') > 0;
INSERT OR IGNORE INTO image_uses (image_id, kind, id)
    SELECT i.id, 'comment', c.id FROM (SELECT id, body_html FROM comments WHERE instr(body_html, '<img') > 0) c
        JOIN images i ON instr(c.body_html, 'src="/img/' || i.id || '"') > 0;
INSERT OR IGNORE INTO image_uses (image_id, kind, id)
    SELECT i.id, 'message', x.id FROM (SELECT id, body_html FROM messages WHERE instr(body_html, '<img') > 0) x
        JOIN images i ON instr(x.body_html, 'src="/img/' || i.id || '"') > 0;
INSERT OR IGNORE INTO image_uses (image_id, kind, id)
    SELECT i.id, 'report', r.id FROM (SELECT id, body_html FROM reports WHERE instr(body_html, '<img') > 0) r
        JOIN images i ON instr(r.body_html, 'src="/img/' || i.id || '"') > 0;
