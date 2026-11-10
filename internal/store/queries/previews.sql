-- name: GetLinkPreview :one
SELECT url, found, title, description, site_name, image_id, fetched_at FROM link_previews WHERE url = sqlc.arg(url);

-- name: SaveLinkPreview :exec
INSERT INTO link_previews (url, found, title, description, site_name, image_id, fetched_at)
VALUES (sqlc.arg(url), sqlc.arg(found), sqlc.arg(title), sqlc.arg(description), sqlc.arg(site_name), sqlc.arg(image_id), sqlc.arg(fetched_at))
ON CONFLICT (url) DO UPDATE SET found = excluded.found, title = excluded.title, description = excluded.description,
    site_name = excluded.site_name, image_id = excluded.image_id, fetched_at = excluded.fetched_at;

-- name: DeleteUnusedLinkPreviews :execrows
-- Deletes the previews fetched before `before` that no live post, comment or message links to. A body stores & in an
-- address as &amp;, so the address is searched for in that form too. The previews' pictures are then unreferenced,
-- and the image sweep deletes them.
DELETE FROM link_previews
WHERE fetched_at < sqlc.arg(before)
  AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.deleted_at IS NULL
                  AND (instr(p.body_html, link_previews.url) > 0 OR instr(p.body_html, replace(link_previews.url, '&', '&amp;')) > 0))
  AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.deleted_at IS NULL
                  AND (instr(c.body_html, link_previews.url) > 0 OR instr(c.body_html, replace(link_previews.url, '&', '&amp;')) > 0))
  AND NOT EXISTS (SELECT 1 FROM messages x WHERE x.deleted_at IS NULL
                  AND (instr(x.body_html, link_previews.url) > 0 OR instr(x.body_html, replace(link_previews.url, '&', '&amp;')) > 0));
