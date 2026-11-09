-- Reports. Only the root group's owner and moderators read them. The handlers check
-- perm.HandleReports before running any of these queries except CreateReport.

-- name: CreateReport :execrows
-- A second report of the same item by the same user changes nothing.
INSERT INTO reports (id, reporter_id, kind, subject_id, group_id, post_id, author_id, body_html, reason, created_at)
VALUES (sqlc.arg(id), sqlc.arg(reporter_id), sqlc.arg(kind), sqlc.arg(subject_id), sqlc.arg(group_id), sqlc.narg(post_id),
        sqlc.arg(author_id), sqlc.arg(body_html), sqlc.arg(reason), sqlc.arg(created_at))
ON CONFLICT (reporter_id, kind, subject_id) DO NOTHING;

-- name: ListOpenReports :many
-- The open reports, oldest first, with each reporter, the item's author and group, and whether the item has been
-- deleted since. With a kind and subject_id, only the reports of that item. The handler groups the rows by item.
SELECT r.id, r.kind, r.subject_id, r.group_id, r.post_id, r.body_html, r.reason, r.created_at,
       ru.id AS reporter_id, ru.username AS reporter_username, ru.picture_id AS reporter_picture_id,
       au.id AS author_id, au.username AS author_username, au.picture_id AS author_picture_id,
       g.kind AS group_kind, g.name AS group_name,
       CAST(CASE
         WHEN g.deleted_at IS NOT NULL THEN 1
         WHEN r.kind = 'post' THEN NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = r.subject_id AND p.deleted_at IS NULL)
         WHEN r.kind = 'comment' THEN NOT EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id
                                                  WHERE c.id = r.subject_id AND c.deleted_at IS NULL AND p.deleted_at IS NULL)
         ELSE NOT EXISTS (SELECT 1 FROM messages m WHERE m.id = r.subject_id AND m.deleted_at IS NULL)
       END AS INTEGER) AS deleted
FROM reports r
JOIN users ru ON ru.id = r.reporter_id
JOIN users au ON au.id = r.author_id
JOIN groups g ON g.id = r.group_id
WHERE r.closed_at IS NULL
  AND (sqlc.narg(subject_id) IS NULL OR (r.kind = sqlc.narg(kind) AND r.subject_id = sqlc.narg(subject_id)))
ORDER BY r.created_at, r.id;

-- name: CloseReports :execrows
-- Closes every open report of one item.
UPDATE reports SET closed_at = sqlc.arg(closed_at), closed_by = sqlc.arg(closed_by), outcome = sqlc.arg(outcome)
WHERE kind = sqlc.arg(kind) AND subject_id = sqlc.arg(subject_id) AND closed_at IS NULL;

-- name: ListUnreadReportNotifications :many
-- The unread notifications of the reports of one item. Closing the reports marks them read.
SELECT n.id, n.user_id FROM notifications n JOIN reports r ON r.id = n.report_id
WHERE r.kind = sqlc.arg(kind) AND r.subject_id = sqlc.arg(subject_id) AND n.read_at IS NULL;

-- name: ListOpenReportItemsByAuthor :many
-- The items by one author that have open reports. Removing the author closes them.
SELECT DISTINCT kind, subject_id FROM reports WHERE author_id = sqlc.arg(author_id) AND closed_at IS NULL;

-- name: ClearReportCopiesByAuthor :exec
-- Clears the copies of a removed user's content kept by reports.
UPDATE reports SET body_html = '' WHERE author_id = sqlc.arg(author_id);
