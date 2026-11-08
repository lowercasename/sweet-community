-- 015: a room's picture (architecture.md, Groups). It is an uploaded image,
-- like a user's picture. Null means the room is shown as a tile with its initial.
ALTER TABLE groups ADD COLUMN picture_id TEXT REFERENCES images(id);
