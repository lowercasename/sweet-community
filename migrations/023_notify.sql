-- 023: what reaches a person away from the app (architecture.md,
-- Notifications). A person's own settings, as the instance has its own:
-- the digest on or off for now. When the weekly digest last went to them.
-- Each device a person asked to be notified on, as the browser describes it.
CREATE TABLE user_settings (
    user_id TEXT NOT NULL REFERENCES users(id),
    key     TEXT NOT NULL,
    value   TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);

ALTER TABLE users ADD COLUMN digest_sent_at INTEGER;

CREATE TABLE push_subscriptions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    endpoint   TEXT NOT NULL UNIQUE,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
