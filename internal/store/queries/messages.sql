-- Chat messages belong to a group's chat. The handler checks membership.

-- name: ListMessages :many
-- Each message with the message it replies to, if any: its author and text, or
-- its deleted time once deleted. The columns match GetMessage.
SELECT m.id, m.group_id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id,
       m.reply_to, r.body_text AS reply_text, r.deleted_at AS reply_deleted_at,
       ru.id AS reply_author_id, ru.username AS reply_author_username, ru.picture_id AS reply_author_picture_id,
       m.kind, su.id AS subject_id, su.username AS subject_username, su.picture_id AS subject_picture_id,
       CAST((SELECT json_group_array(json_array(x.emoji, x.user_id))
             FROM (SELECT emoji, user_id FROM reactions WHERE item_id = m.id ORDER BY rowid) x) AS TEXT) AS reactions
FROM messages m JOIN users u ON u.id = m.author_id
LEFT JOIN messages r ON r.id = m.reply_to
LEFT JOIN users ru ON ru.id = r.author_id
LEFT JOIN users su ON su.id = m.subject_id
WHERE m.group_id = sqlc.arg(group_id) AND m.deleted_at IS NULL AND m.created_at <= sqlc.arg(before)
  AND (m.created_at < sqlc.arg(before) OR m.id < sqlc.arg(before_id))
ORDER BY m.created_at DESC, m.id DESC
LIMIT sqlc.arg(page_size);

-- name: GetMessage :one
SELECT m.id, m.group_id, m.body_html, m.body_text, m.created_at,
       u.id AS author_id, u.username AS author_username, u.picture_id AS author_picture_id,
       m.reply_to, r.body_text AS reply_text, r.deleted_at AS reply_deleted_at,
       ru.id AS reply_author_id, ru.username AS reply_author_username, ru.picture_id AS reply_author_picture_id,
       m.kind, su.id AS subject_id, su.username AS subject_username, su.picture_id AS subject_picture_id,
       CAST((SELECT json_group_array(json_array(x.emoji, x.user_id))
             FROM (SELECT emoji, user_id FROM reactions WHERE item_id = m.id ORDER BY rowid) x) AS TEXT) AS reactions
FROM messages m JOIN users u ON u.id = m.author_id
LEFT JOIN messages r ON r.id = m.reply_to
LEFT JOIN users ru ON ru.id = r.author_id
LEFT JOIN users su ON su.id = m.subject_id
WHERE m.id = sqlc.arg(id) AND m.deleted_at IS NULL;

-- name: CreateMessage :exec
INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at, reply_to)
VALUES (sqlc.arg(id), sqlc.arg(group_id), sqlc.arg(author_id), sqlc.arg(body_html), sqlc.arg(body_text), sqlc.arg(created_at), sqlc.narg(reply_to));

-- name: GetMessageOwners :one
SELECT m.author_id, m.group_id, m.kind FROM messages m JOIN groups g ON g.id = m.group_id
WHERE m.id = sqlc.arg(id) AND m.deleted_at IS NULL AND g.deleted_at IS NULL;

-- name: DeleteMessage :exec
-- Deletes a message and empties its text. The row stays, so a reply to it can say that it was deleted.
UPDATE messages SET deleted_at = sqlc.arg(deleted_at), body_html = '', body_text = ''
WHERE id = sqlc.arg(id) AND deleted_at IS NULL;

-- name: DeleteGroupMessages :exec
-- Deletes the live messages of a group and empties their text.
UPDATE messages SET deleted_at = sqlc.arg(deleted_at), body_html = '', body_text = ''
WHERE group_id = sqlc.arg(group_id) AND deleted_at IS NULL;

-- name: ListReplyIDs :many
-- The live messages that reply to a message. Deleting the message logs them again, so the log no longer holds the
-- deleted message's text in their quotes.
SELECT id FROM messages WHERE reply_to = sqlc.arg(reply_to) AND deleted_at IS NULL;

-- name: ListLiveMessagesByAuthor :many
-- A user's messages that are not deleted, with their groups, for the delete events when the user is removed.
SELECT id, group_id FROM messages WHERE author_id = sqlc.arg(author_id) AND deleted_at IS NULL;

-- name: EraseAuthorMessages :exec
-- Deletes and empties the messages of a removed user that eraseContent did not delete, such as messages deleted before.
-- Rows that are already deleted and empty are not updated again.
UPDATE messages SET deleted_at = COALESCE(deleted_at, sqlc.arg(deleted_at)), body_html = '', body_text = ''
WHERE author_id = sqlc.arg(author_id) AND (deleted_at IS NULL OR body_html != '' OR body_text != '');

-- name: CreateChatLine :exec
-- A joined or added line in a chat. It has no body.
INSERT INTO messages (id, group_id, author_id, body_html, body_text, created_at, kind, subject_id)
VALUES (sqlc.arg(id), sqlc.arg(group_id), sqlc.arg(author_id), '', '', sqlc.arg(created_at), sqlc.arg(kind), sqlc.narg(subject_id));
