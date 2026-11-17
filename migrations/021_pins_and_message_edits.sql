ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
CREATE INDEX posts_pinned ON posts(group_id, created_at DESC, id DESC) WHERE pinned = 1 AND deleted_at IS NULL;
ALTER TABLE messages ADD COLUMN edited_at INTEGER;
ALTER TABLE messages ADD COLUMN reply_text TEXT;

-- Keep the text each existing reply quotes before messages become editable.
UPDATE messages SET reply_text = (
  SELECT substr(original.body_text, 1, 200) FROM messages original
  WHERE original.id = messages.reply_to AND original.deleted_at IS NULL
) WHERE reply_to IS NOT NULL AND deleted_at IS NULL;

-- Every deletion path clears the saved quotes as well as the original message.
CREATE TRIGGER messages_clear_quotes AFTER UPDATE OF deleted_at ON messages
WHEN NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE messages SET reply_text = NULL WHERE (id = NEW.id OR reply_to = NEW.id) AND reply_text IS NOT NULL;
END;
