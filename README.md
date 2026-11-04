# Sweet v2

A small social network for one group: one feed of long posts, one chat room, side by side, run as one binary. Proof of concept.

Design notes: `architecture.md`. Why: `sweet-retrospective.html`.

## Run

```
make build                     # builds web/ into internal/web/dist, then bin/sweet
./bin/sweet -db data/sweet.db -owner raphael -owner-password 'something long'
```

Open http://localhost:8080 and sign in as the owner. Images go to `-images-dir` (default `data/images`) unless `SWEET_S3_ENDPOINT` and `SWEET_S3_BUCKET` are set, with `SWEET_S3_ACCESS_KEY`, `SWEET_S3_SECRET_KEY`, optional `SWEET_S3_REGION` (default `auto`, right for R2), `SWEET_S3_PREFIX` and `SWEET_S3_INSECURE=1` for a plain-http stand-in. Flags: `-addr` (default `:8080`), `-db`, `-owner`, `-owner-password` (or `SWEET_OWNER_PASSWORD`; used only until the owner has a password). Everyone else joins through an invite link the owner makes on the People page.

## Develop

```
make dev-backend               # go run on :8080 (serves a placeholder page without a frontend build)
                               # set SWEET_OWNER_PASSWORD the first time
cd web && pnpm install && pnpm dev   # Vite on :5173, proxies /api and /healthz to :8080
```

Backend: `go test ./...`; after changing a query or migration, `make generate` (sqlc runs via `go tool`, nothing to install). Frontend, in `web/`: `pnpm typecheck`, `pnpm test` (TipTap round-trip), `pnpm check:atomic` (no raw HTML outside `src/ui/`).

## Layout

```
cmd/sweet/          main; migrations/ is copied here by make (go:embed can't reach ../)
internal/auth       password hashing, tokens, username rules
internal/db         SQLite open (WAL, busy_timeout, BEGIN IMMEDIATE), migrations
internal/store      sqlc: queries/*.sql in, typed Go out (make generate; never edit the .go files)
internal/sanitize   the one bluemonday policy every body passes through
internal/events     event log, in-process pub/sub, SSE handler
internal/images     upload processing (magic bytes in, bounded JPEG/PNG out) and storage drivers (local dir, S3/R2)
internal/api        handlers: sessions and invites (auth.go, invites.go), posts, messages, users; tests in api_test.go
internal/web        embeds the frontend build
migrations/         *.sql, forward-only
web/                React + TipTap; see web/README.md
```
