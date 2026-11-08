-- Sign-in by email (architecture.md, Accounts). A sign-in token is used by its link or by a six-digit code. The code
-- works only in the browser that asked for it, so the row holds the hash of that browser's cookie. Five wrong codes
-- void a token. The kinds are now 'signin' and 'verify'. SQLite cannot change a CHECK constraint in place, so the
-- table is rebuilt. The existing tokens are deleted, because their links led to pages that no longer exist. A person
-- holding one asks for a new email.
CREATE TABLE email_tokens_new (
    hash         TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id),
    kind         TEXT NOT NULL CHECK (kind IN ('signin', 'verify')),
    email        TEXT NOT NULL,
    code_hash    TEXT,
    request_hash TEXT,
    attempts     INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    used_at      INTEGER
);
DROP TABLE email_tokens;
ALTER TABLE email_tokens_new RENAME TO email_tokens;
CREATE INDEX email_tokens_user ON email_tokens(user_id);
CREATE INDEX email_tokens_request ON email_tokens(request_hash);
