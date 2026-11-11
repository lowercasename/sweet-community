-- Only a successful registration grants permission to correct an unverified address.
ALTER TABLE users ADD COLUMN registration_hash TEXT;
ALTER TABLE users ADD COLUMN registration_expires_at INTEGER;
CREATE UNIQUE INDEX users_registration_hash ON users(registration_hash) WHERE registration_hash IS NOT NULL;
