-- Link previews. The title, description and picture that a page gives in its OpenGraph tags, fetched once
-- for each address. A page that gave no title is kept with found = 0, so that it is not fetched on every view.
CREATE TABLE link_previews (
    url TEXT PRIMARY KEY,
    found INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_id TEXT REFERENCES images(id),
    fetched_at INTEGER NOT NULL
);
CREATE INDEX link_previews_image ON link_previews(image_id);
