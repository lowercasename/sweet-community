-- A notification about a chat message (a mention or a reply) names the
-- message, so opening the notification can scroll the chat to it
-- (architecture.md, Notifications).
ALTER TABLE notifications ADD COLUMN message_id TEXT REFERENCES messages(id);
