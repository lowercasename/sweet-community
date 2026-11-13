-- A discussion keeps one notification. When new activity makes a read notification unread again, seen_count keeps
-- the activity count the user had already read, so the list counts the updates since then.
ALTER TABLE notifications ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 0;
