-- name: GetLinkPreview :one
SELECT url, found, title, description, image_id, fetched_at, player, player_width, player_height FROM link_previews WHERE url = sqlc.arg(url);

-- name: SaveLinkPreview :exec
INSERT INTO link_previews (url, found, title, description, image_id, fetched_at, player, player_width, player_height)
VALUES (sqlc.arg(url), sqlc.arg(found), sqlc.arg(title), sqlc.arg(description), sqlc.arg(image_id), sqlc.arg(fetched_at),
    sqlc.arg(player), sqlc.arg(player_width), sqlc.arg(player_height))
ON CONFLICT (url) DO UPDATE SET found = excluded.found, title = excluded.title, description = excluded.description,
    image_id = excluded.image_id, fetched_at = excluded.fetched_at, player = excluded.player,
    player_width = excluded.player_width, player_height = excluded.player_height;

-- name: DeleteUnusedLinkPreviews :execrows
-- Deletes the previews fetched before `before` that no live post, comment or message shows as a card. The previews'
-- pictures are then unreferenced, and the image sweep deletes them.
DELETE FROM link_previews
WHERE fetched_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM live_link_uses u WHERE u.url = link_previews.url);

-- name: DeleteLinkUses :exec
DELETE FROM link_uses WHERE kind = sqlc.arg(kind) AND id = sqlc.arg(id);

-- name: AddLinkUse :exec
INSERT OR IGNORE INTO link_uses (url, kind, id) VALUES (sqlc.arg(url), sqlc.arg(kind), sqlc.arg(id));
