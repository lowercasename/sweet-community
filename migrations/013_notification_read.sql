-- 013: a notification is read by opening it, not by looking at the page
-- (architecture.md, Notifications): read_at on the row. The notifications
-- stream's marker goes; what it had marked read becomes read on the rows.
ALTER TABLE notifications ADD COLUMN read_at INTEGER;
UPDATE notifications SET read_at = (SELECT r.read_at FROM read_markers r WHERE r.user_id = notifications.user_id AND r.stream = 'notifications')
WHERE created_at <= COALESCE((SELECT r.read_at FROM read_markers r WHERE r.user_id = notifications.user_id AND r.stream = 'notifications'), 0);
DELETE FROM read_markers WHERE stream = 'notifications';
