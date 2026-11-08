-- Each event names the resource it describes, such as "post:<id>" (architecture.md, Realtime). The log keeps only the
-- newest event for each resource, so a replay never returns deleted content or an earlier version of an edited post.
ALTER TABLE events ADD COLUMN key TEXT;
CREATE INDEX events_by_key ON events(key);

-- The existing rows hold deleted content and earlier versions. The log is used only when a client reconnects, and
-- every client refetches its data when it reconnects, so the rows are deleted. AUTOINCREMENT keeps the sequence
-- numbers increasing, so a client's last sequence number stays valid.
DELETE FROM events;
