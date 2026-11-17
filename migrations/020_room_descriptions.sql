-- Existing rooms start without a description.
ALTER TABLE groups ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 140);
-- Older snapshots omit the description. Clients fetch the current group instead.
DELETE FROM events WHERE kind = 'group';
