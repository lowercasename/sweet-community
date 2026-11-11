-- Deleting a message looks up the replies to it, so their quotes can say it was deleted. This index makes that a
-- lookup by reply_to instead of a read of every message.
CREATE INDEX messages_reply_to ON messages(reply_to);
