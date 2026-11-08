-- 013: a notification is read by opening it, not by viewing the page
-- (architecture.md, Notifications). read_at is stored on the row. The
-- notifications stream's marker is deleted, and the notifications it had
-- marked read are marked read on their rows.
ALTER TABLE notifications ADD COLUMN read_at INTEGER;
UPDATE notifications SET read_at = (SELECT r.read_at FROM read_markers r WHERE r.user_id = notifications.user_id AND r.stream = 'notifications')
WHERE created_at <= COALESCE((SELECT r.read_at FROM read_markers r WHERE r.user_id = notifications.user_id AND r.stream = 'notifications'), 0);
DELETE FROM read_markers WHERE stream = 'notifications';
