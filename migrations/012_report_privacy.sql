-- Remove notifications sent to reported authors before the privacy rule changed.
DELETE FROM notifications WHERE kind = 'report' AND EXISTS (
    SELECT 1 FROM reports r WHERE r.id = notifications.report_id AND r.author_id = notifications.user_id
);

-- Old events contain reporter identities or lack the author needed to restrict delivery.
-- Reconnecting clients fetch current reports, notifications and unread counts.
DELETE FROM events WHERE kind IN ('report', 'report_delete')
    OR (kind = 'notification' AND json_extract(payload, '$.kind') = 'report')
    OR (kind = 'marker' AND json_extract(payload, '$.stream') = 'notifications');
