-- A deleted room kept its picture. The image sweep then failed to delete the picture's row, because the room still
-- referenced it, and stopped. Deleting a room now releases its picture, and this releases the pictures of rooms
-- deleted before.
UPDATE groups SET picture_id = NULL WHERE deleted_at IS NOT NULL;
