-- Joined and added lines in chat (architecture.md, Chat). A message has a kind. A line's author is the person who
-- joined, or who added someone, and its subject is the person added. A line has no body.
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'joined', 'added'));
ALTER TABLE messages ADD COLUMN subject_id TEXT REFERENCES users(id);
