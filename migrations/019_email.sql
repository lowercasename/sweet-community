-- 019: email (architecture.md, Accounts). An account has an address, which
-- is verified before it can be used. A change takes effect once the new
-- address is verified, so the old one stays until then. Tokens for verifying
-- and for resetting a password are stored by hash, expire, and are used once.
-- The owner created on first run has no address until they set one.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN pending_email TEXT;
CREATE UNIQUE INDEX users_email ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE email_tokens (
    hash       TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
    email      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at    INTEGER
);
CREATE INDEX email_tokens_user ON email_tokens(user_id);
