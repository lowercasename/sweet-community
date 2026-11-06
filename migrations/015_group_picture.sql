-- 015: a room's picture (architecture.md, Groups): an uploaded image, as a
-- person's picture is. Null is the tile with the room's initial.
ALTER TABLE groups ADD COLUMN picture_id TEXT REFERENCES images(id);
