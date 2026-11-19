-- The player that a link preview's page gives in its twitter:player tag: its address and its size. player is empty
-- when the page gives none.
ALTER TABLE link_previews ADD COLUMN player TEXT NOT NULL DEFAULT '';
ALTER TABLE link_previews ADD COLUMN player_width INTEGER NOT NULL DEFAULT 0;
ALTER TABLE link_previews ADD COLUMN player_height INTEGER NOT NULL DEFAULT 0;

-- The previews kept so far were fetched before players were read. They are deleted, and each is fetched again, with
-- its player, the next time its card is shown. Their pictures are then unreferenced, and the image sweep deletes them.
DELETE FROM link_previews;
