# Sweet v2

A small social network for one group: one feed of long posts, one chat room, side by side, run as one binary. Proof of concept.

Design notes: `architecture.md`. Why: `sweet-retrospective.html`.

## Run your own

Sweet runs as one container, with Caddy in a second one for HTTPS. Everything it keeps is in one Docker volume and, if you give it a bucket, in that bucket.

### What you need

- A Linux server with Docker and Docker Compose (`docker compose version` prints v2 or later).
- A domain name with an A record pointing at the server. Set the record before you start, since Caddy fetches the certificate when the first visitor arrives.
- An SMTP account, for the emails that verify an address and reset a password. Any provider works. You can add it later.
- Optional: a Cloudflare R2 bucket, or any S3 bucket. Images are kept in it and the database is backed up to it continuously. Without one, images stay on the server's disk and nothing is backed up.

### Install

```
git clone <the Sweet repository> sweet
cd sweet/deploy
cp env.example .env
nano .env                      # the domain, then email and the bucket if you have them
docker compose up -d --build   # builds the image (a few minutes the first time) and starts it
docker compose logs sweet      # look for the line starting SETUP:
```

The `SETUP:` line holds a link. Open it to become the owner, name the community and get an invite link to send to your people.

### If you already run a reverse proxy

Use `compose.proxied.yml` instead. It starts Sweet alone, listening on `127.0.0.1:8080` (`SWEET_PORT` in `.env` changes the port).

```
docker compose -f compose.proxied.yml up -d --build
```

Send the domain to that port from your proxy. It must pass `X-Forwarded-For` and `X-Forwarded-Proto`, which Caddy, nginx and Traefik do by default. In a Caddyfile:

```
sweet.example.org {
	reverse_proxy 127.0.0.1:8080
}
```

If your proxy is itself a container, it cannot reach `127.0.0.1`. Set `SWEET_BIND` in `.env` to the docker bridge address (`ip -4 addr show docker0`, usually `172.17.0.1`) and point the proxy at `host.docker.internal:8080`. That name resolves to the bridge address when the proxy's container has `extra_hosts: ["host.docker.internal:host-gateway"]` in its compose file.

### Email

Fill in the `SWEET_SMTP_` settings and `SWEET_MAIL_FROM` in `.env`, then `docker compose up -d`. For Mailgun: host `smtp.mailgun.org` (`smtp.eu.mailgun.org` for an EU domain), port `587`, and the user and password from the domain's SMTP credentials. The from-address must be on a domain the provider lets you send from.

Until then, every email Sweet would have sent is a file in the data volume. `docker compose exec sweet ls /data/mail` lists them and `docker compose exec sweet cat /data/mail/<file>` shows one.

### The bucket: images and backups

On Cloudflare, make an R2 bucket for this instance, then an API token for it: R2 → Manage API tokens → Create, permission Object Read & Write, scoped to that bucket. Put in `.env`:

```
SWEET_S3_ENDPOINT=<your account id>.r2.cloudflarestorage.com
SWEET_S3_BUCKET=<the bucket's name>
SWEET_S3_ACCESS_KEY=<the token's access key id>
SWEET_S3_SECRET_KEY=<the token's secret access key>
```

Then `docker compose up -d`. Images are stored in the bucket under `images/` and the database is replicated to it under `db/`, a second or so behind. The bucket and your `.env` together are the whole backup, so keep a copy of `.env` somewhere safe.

Any S3 service works in place of R2. Set `SWEET_S3_REGION` to its region.

### Upgrading

```
cd sweet
git pull
cd deploy
docker compose up -d --build
```

Before changing the database's structure, Sweet keeps a copy of it beside it in the volume as `sweet.db.before-upgrade`. Open tabs reload themselves. `docker compose run --rm sweet -version` prints the installed version.

### Restoring

- **The server is gone.** On a new one, install as above with the same `.env`. Sweet finds no database, fetches the latest from the bucket and starts. The images are already there.
- **An upgrade went wrong.** `docker compose down`, go back to the version you had (`git checkout <the previous commit>`), then `docker compose run --rm sweet sh -c 'cp /data/sweet.db.before-upgrade /data/sweet.db'` and `docker compose up -d --build`.
- **Something was deleted and you want the database as it was at a moment.** Stop Sweet, restore the database as of that moment (UTC), start it:

  ```
  docker compose stop sweet
  docker compose run --rm sweet restore 2026-11-06T18:00:00Z
  docker compose up -d sweet
  ```

  Without a timestamp, `restore` fetches the latest.

### Without Docker

`make build` produces `bin/sweet`, one file with the frontend and the migrations inside it. It takes the same settings from the environment, and `./bin/sweet -help` lists its flags. Put a reverse proxy in front of it with `SWEET_TRUST_PROXY=1`. If you run Litestream yourself, start Sweet with `SWEET_LITESTREAM=1` so it leaves checkpointing to Litestream.

## Develop

```
make dev-backend               # go run on :8080 (serves a placeholder page without a frontend build)
                               # set SWEET_OWNER_PASSWORD the first time. Email lands in data/mail,
                               # with links to :5173 so they open in the dev server
cd web && pnpm install && pnpm dev   # Vite on :5173, proxies /api and /healthz to :8080
```

`make build` then `./bin/sweet -db data/sweet.db -owner raphael -owner-password 'something long'` runs the built binary on :8080. With no `-owner-password`, a fresh instance prints the setup link instead. Settings come from the environment: copy `.env.example` to `.env` (gitignored) and the `make` targets load it. For a bare `./bin/sweet`, run `set -a; . ./.env; set +a` first. Flags: `-addr` (default `:8080`), `-db`, `-owner`, `-owner-password` (or `SWEET_OWNER_PASSWORD`), `-images-dir`, `-mail-dir`, `-base-url` (or `SWEET_BASE_URL`), `-trust-proxy`, `-litestream`, `-version`.

Backend: `go test ./...`. After changing a query or migration, `make generate` (sqlc runs via `go tool`, nothing to install). Frontend, in `web/`: `pnpm typecheck`, `pnpm test`, `pnpm check:atomic` (no raw HTML outside `src/ui/`).

## Layout

```
cmd/sweet/          main. migrations/ is copied here by make (go:embed can't reach ../)
deploy/             the compose stack: compose.yml (with Caddy), compose.proxied.yml, the Caddyfile,
                    Litestream's config and the container's entrypoint. Dockerfile is at the root
internal/auth       password hashing, tokens, username rules
internal/db         SQLite open (WAL, busy_timeout, BEGIN IMMEDIATE), migrations
internal/store      sqlc: queries/*.sql in, typed Go out (make generate, never edit the .go files)
internal/sanitize   the one bluemonday policy every body passes through
internal/events     event log, in-process pub/sub, SSE handler
internal/images     upload processing (magic bytes in, bounded JPEG/PNG out) and storage drivers (local dir, S3/R2)
internal/api        handlers: sessions and invites (auth.go, invites.go), posts, messages, users. Tests in api_test.go
internal/version    the binary's name: a hash of its own bytes, sent first on the stream
internal/web        embeds the frontend build
migrations/         *.sql, forward-only
web/                React + TipTap. See web/README.md
```
