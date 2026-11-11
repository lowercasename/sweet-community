-- Removed accounts no longer need email addresses or email delivery metadata.
UPDATE users SET email = NULL, pending_email = NULL, email_verified_at = NULL, digest_sent_at = NULL
WHERE removed_at IS NOT NULL;
