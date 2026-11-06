-- Instance settings: a key and a value (architecture.md, Feature flags).

-- name: GetSetting :one
SELECT value FROM settings WHERE key = sqlc.arg(key);

-- name: ListSettings :many
SELECT key, value FROM settings ORDER BY key;

-- name: SetSetting :exec
INSERT INTO settings (key, value) VALUES (sqlc.arg(key), sqlc.arg(value))
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- name: DeleteSetting :exec
DELETE FROM settings WHERE key = sqlc.arg(key);
