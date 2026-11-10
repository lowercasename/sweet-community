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

-- The cards that count, in live bodies. See live_bodies in 006_image_uses.sql.
CREATE VIEW live_link_uses AS
    SELECT u.url FROM link_uses u
        JOIN live_bodies b ON b.kind = u.kind AND b.id = u.id;

-- Stored files whose images have been deleted, waiting to be deleted from storage. The image sweep deletes an image's
-- row in a short transaction and the file afterwards, so it never holds the write lock while it waits on storage. A
-- file that cannot be deleted stays here and is tried again on the next run.
CREATE TABLE image_files_to_delete (
    key TEXT PRIMARY KEY
);
