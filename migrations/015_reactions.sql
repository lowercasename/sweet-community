-- A member's emoji on a post, comment or message. item_id is the item's id. Ids are UUIDv7, so an id names one item
-- of one kind. The handlers delete an item's reactions when they delete the item. The rowid gives the order the
-- reactions were added in, which created_at cannot within one millisecond.
CREATE TABLE reactions (
    item_id    TEXT NOT NULL,
    emoji      TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    UNIQUE (item_id, emoji, user_id)
);

-- Removing a user deletes their reactions.
CREATE INDEX reactions_user ON reactions(user_id);
