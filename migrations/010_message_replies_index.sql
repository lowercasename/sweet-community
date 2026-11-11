-- Deleting a message finds the replies to it, so their quotes can say it was deleted. Without this index each search
-- read every message, and removing a user with many messages held the write lock for seconds.
CREATE INDEX messages_reply_to ON messages(reply_to);
