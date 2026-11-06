# Sweet v2

A small social network for one group: one feed of long posts, one chat room, side by side, run as one binary. Proof of concept.

Design notes: `architecture.md`. Why: `sweet-retrospective.html`.

## Run your own

Sweet runs as one container, with a second one (Caddy) that gets the certificate and serves HTTPS. Everything it keeps is in one Docker volume and, if you give it a bucket, in that bucket.

### What you need

- A Linux server with Docker and Docker Compose (`docker compose version` prints v2 or later). Any small one will do.
- A domain name, with an A record pointing at the server. The certificate is fetched when the first visitor arrives, so set the record before you start.
- An SMTP account for sending email, for the links that verify an address and reset a password. Any service works: Mailgun, SendGrid, Postmark, Fastmail, your own. You can add it later.
- Optional: a Cloudflare R2 bucket (or any S3 bucket). Images are kept in it, and the database is backed up to it continuously. Without one, images stay on the server's disk and nothing is backed up.

### Install

```
git clone <the Sweet repository> sweet
cd sweet/deploy
cp env.example .env
nano .env                      # the domain, then email and the bucket if you have them
docker compose up -d --build   # builds the image (a few minutes the first time) and starts it
docker compose logs sweet      # look for the line starting SETUP:
```

The `SETUP:` line holds a link. Open it: it makes you the owner. Then name the community, copy the invite link it gives you, and send that to your people. The invite link works for seven days for anyone who has it, and the owner is told each time someone joins. Make a new one from the People page whenever you like.

Open tabs are told when the server is upgraded, and reload themselves.

### If you already run a reverse proxy

Use `compose.proxied.yml` instead. It starts Sweet alone, listening on `127.0.0.1:8080` (set `SWEET_PORT` in `.env` to use another port).

```
docker compose -f compose.proxied.yml up -d --build
```

Then send the domain to that port from your proxy, which must pass `X-Forwarded-For` and `X-Forwarded-Proto` (Caddy, nginx and Traefik do by default). In a Caddyfile that is:

```
sweet.example.org {
	reverse_proxy 127.0.0.1:8080
}
```

If your proxy is itself a container, it cannot reach `127.0.0.1`. Set `SWEET_BIND` in `.env` to the docker bridge address (`ip -4 addr show docker0`, usually `172.17.0.1`), and have the proxy send to `host.docker.internal:8080`, which resolves to that address when the proxy's container is started with `--add-host host.docker.internal:host-gateway` (in compose: `extra_hosts: ["host.docker.internal:host-gateway"]`).

### Email

Fill in `SWEET_SMTP_HOST`, `SWEET_SMTP_PORT`, `SWEET_SMTP_USER`, `SWEET_SMTP_PASSWORD` and `SWEET_MAIL_FROM` in `.env`, then `docker compose up -d`. SendGrid, for one, is host `smtp.sendgrid.net`, port `587`, user `apikey` and your API key as the password; the from-address must be one the service lets you send from.

Until then, every message Sweet would have sent is a file in the data volume: `docker compose exec sweet ls /data/mail` lists them and `docker compose exec sweet cat /data/mail/<file>` shows one, link included.

### The bucket: images and backups

On Cloudflare, make an R2 bucket for this instance, then an API token for it: R2 → Manage API tokens → Create, permission Object Read & Write, scoped to that bucket. Put in `.env`:

```
SWEET_S3_ENDPOINT=<your account id>.r2.cloudflarestorage.com
SWEET_S3_BUCKET=<the bucket's name>
SWEET_S3_ACCESS_KEY=<the token's access key id>
SWEET_S3_SECRET_KEY=<the token's secret access key>
```

Then `docker compose up -d`. From then on, images are stored in the bucket under `images/`, and Litestream, running in the same container, streams every change to the database into the bucket under `db/`, a second or so behind. The bucket and your `.env` together are the whole backup: keep a copy of `.env` somewhere safe.

Any S3 service works in place of R2; set `SWEET_S3_REGION` to its region.

### Upgrading

```
cd sweet
git pull
cd deploy
docker compose up -d --build
```

Before it applies any change to the database's structure, Sweet keeps a copy of the database as it was, beside it in the volume, as `sweet.db.before-upgrade`. Open tabs reload themselves. `docker compose run --rm sweet -version` prints the version that is installed.

### Restoring

- **The server is gone.** On a new one, install as above with the same `.env`. When it starts and finds no database, it fetches the latest from the bucket; the images are already there. Nothing else to do.
- **An upgrade went wrong.** `docker compose down`, then go back to the version you had (`git checkout <the previous commit>`), then `docker compose run --rm sweet sh -c 'cp /data/sweet.db.before-upgrade /data/sweet.db'` and `docker compose up -d --build`.
- **Something was deleted and you want the database as it was at a moment.** Stop Sweet, put back the database as of that moment (UTC), start it:

  ```
  docker compose stop sweet
  docker compose run --rm sweet restore 2026-11-06T18:00:00Z
  docker compose up -d sweet
  ```

  Without a timestamp, `restore` fetches the latest. The last few minutes before the moment are exact; further back, the nearest point a few minutes either side.

### Without Docker

`make build` produces `bin/sweet`, one file with the frontend and the migrations inside it. It takes the same settings from the environment and some flags: `./bin/sweet -help` lists them. Put a reverse proxy in front of it with `SWEET_TRUST_PROXY=1`, and if you run Litestream yourself, start Sweet with `SWEET_LITESTREAM=1` so it leaves checkpointing to Litestream.

## Develop

```
make dev-backend               # go run on :8080 (serves a placeholder page without a frontend build)
                               # set SWEET_OWNER_PASSWORD the first time; email lands in data/mail,
                               # with links to :5173 so they open in the dev server
cd web && pnpm install && pnpm dev   # Vite on :5173, proxies /api and /healthz to :8080
```

`make build` then `./bin/sweet -db data/sweet.db -owner raphael -owner-password 'something long'` runs the built binary on :8080. With no `-owner-password`, a fresh instance prints the setup link instead. Settings come from the environment: copy `.env.example` to `.env` (gitignored) and the `make` targets load it; for a bare `./bin/sweet`, `set -a; . ./.env; set +a` first. Flags: `-addr` (default `:8080`), `-db`, `-owner`, `-owner-password` (or `SWEET_OWNER_PASSWORD`), `-images-dir`, `-mail-dir`, `-base-url` (or `SWEET_BASE_URL`), `-trust-proxy`, `-litestream`, `-version`.

Backend: `go test ./...`; after changing a query or migration, `make generate` (sqlc runs via `go tool`, nothing to install). Frontend, in `web/`: `pnpm typecheck`, `pnpm test` (TipTap round-trip), `pnpm check:atomic` (no raw HTML outside `src/ui/`).

## Layout

```
cmd/sweet/          main; migrations/ is copied here by make (go:embed can't reach ../)
deploy/             the compose stack: compose.yml (with Caddy), compose.proxied.yml, the Caddyfile,
                    Litestream's config and the container's entrypoint; Dockerfile is at the root
internal/auth       password hashing, tokens, username rules
internal/db         SQLite open (WAL, busy_timeout, BEGIN IMMEDIATE), migrations
internal/store      sqlc: queries/*.sql in, typed Go out (make generate; never edit the .go files)
internal/sanitize   the one bluemonday policy every body passes through
internal/events     event log, in-process pub/sub, SSE handler
internal/images     upload processing (magic bytes in, bounded JPEG/PNG out) and storage drivers (local dir, S3/R2)
internal/api        handlers: sessions and invites (auth.go, invites.go), posts, messages, users; tests in api_test.go
internal/version    the binary's name: a hash of its own bytes, sent first on the stream
internal/web        embeds the frontend build
migrations/         *.sql, forward-only
web/                React + TipTap; see web/README.md
```
