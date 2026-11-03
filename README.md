# Sweet v2

A small social network for one group: one feed, one chat room, long posts, run as one binary. Proof of concept.

Design notes: `architecture.md`. Why: `sweet-retrospective.html`.

## Run

```
make build                     # builds web/ into internal/web/dist, then bin/sweet
./bin/sweet -db data/sweet.db -owner raphael
```

Open http://localhost:8080. Flags: `-addr` (default `:8080`), `-db`, `-owner` (the single PoC user).

## Develop

```
make dev-backend               # go run on :8080 (serves a placeholder page without a frontend build)
cd web && pnpm install && pnpm dev   # Vite on :5173, proxies /api and /healthz to :8080
```

Backend: `go test ./...`. Frontend, in `web/`: `pnpm typecheck`, `pnpm test` (TipTap round-trip), `pnpm check:atomic` (no raw HTML outside `src/ui/`).

## Layout

```
cmd/sweet/          main; migrations/ is copied here by make (go:embed can't reach ../)
internal/db         SQLite open (WAL, busy_timeout, BEGIN IMMEDIATE), migrations
internal/sanitize   the one bluemonday policy every body passes through
internal/events     event log, in-process pub/sub, SSE handler
internal/api        handlers
internal/web        embeds the frontend build
migrations/         *.sql, forward-only
web/                React + TipTap; see web/README.md
```
