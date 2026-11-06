# Sweet v2

A small social network for one group: one feed of long posts, one chat room, side by side, run as one binary. Proof of concept.

Design notes: `architecture.md`. Why: `sweet-retrospective.html`.

## Run

```
make build                     # builds web/ into internal/web/dist, then bin/sweet
./bin/sweet -db data/sweet.db -owner raphael -owner-password 'something long'
```

Open http://localhost:8080. With no `-owner-password`, the first start prints a setup link (`SETUP: …`) to its log: open it to become the owner, then the welcome page names the community and hands you an invite link. With the flag, the owner is made at start and the welcome page follows the first sign-in.

Settings come from the environment. Copy `.env.example` to `.env` (gitignored) and `make` targets load it; for a bare `./bin/sweet`, `set -a; . ./.env; set +a` first. Images go to `-images-dir` (default `data/images`) unless `SWEET_S3_ENDPOINT` and `SWEET_S3_BUCKET` are set. Email (verification links, password resets) goes by SMTP when `SWEET_SMTP_HOST` is set, else to files in `-mail-dir` (default `data/mail`); links point at `-base-url` (or `SWEET_BASE_URL`, default `http://localhost:8080`). Flags: `-addr` (default `:8080`), `-db`, `-owner`, `-owner-password` (or `SWEET_OWNER_PASSWORD`; used only until the owner has a password), `-images-dir`, `-mail-dir`, `-base-url`. Everyone else joins through an invite link the owner makes on the People page or the welcome page, good for anyone who has it for seven days; the link each is then sent by email signs them in. The community's name and description are on the owner's Community page.

## Develop

```
make dev-backend               # go run on :8080 (serves a placeholder page without a frontend build)
                               # set SWEET_OWNER_PASSWORD the first time; email lands in data/mail,
                               # with links to :5173 so they open in the dev server
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
