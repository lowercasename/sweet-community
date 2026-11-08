-- 023: notifications sent to a user outside the app (architecture.md,
-- Notifications). This adds per-user settings, like the instance's own
-- settings. For now the only one turns the digest on or off. It adds the time
-- the weekly digest was last sent to each user. It adds each device a user
-- subscribed for push, as the browser describes it.
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
