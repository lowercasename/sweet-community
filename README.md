# Sweet

A small social network for one community. Each community has a feed of posts and a chat, private rooms with their own posts and chat, and private conversations between two people. One instance is one binary with one SQLite database.

Design notes: `architecture.md`.

## Run your own

Sweet runs as one container, with Caddy in a second one for HTTPS. Everything it keeps is in one Docker volume and, if you give it a bucket, in that bucket.

### What you need

- A Linux server with Docker and Docker Compose (`docker compose version` prints v2 or later).
- A domain name with an A record pointing at the server. Set the record before you start.
- An SMTP account, for the sign-in emails. Members sign in with a link and a code sent by email, so it is needed before anyone joins. Any provider works.
- Optional: an S3-compatible storage bucket. Images are kept in it and the database is backed up to it continuously. Without one, images stay on the server's disk and nothing is backed up.

### Install

```
git clone https://github.com/lowercasename/sweet-community.git sweet
cd sweet/deploy
cp env.example .env
nano .env                      # the domain, then email and the bucket if you have them
docker compose pull            # fetches the image
docker compose up -d           # starts it
docker compose logs sweet      # look for the line starting SETUP:
```

The `SETUP:` line holds a link. Open it to become the owner, name the community and get an invite link to send to your people.

To build the image yourself, run `docker compose up -d --build` instead of pulling it.

### If you already run a reverse proxy

Use `compose.proxied.yml` instead. It starts Sweet alone, listening on `127.0.0.1:8080` (`SWEET_PORT` in `.env` changes the port).

```
docker compose -f compose.proxied.yml pull
docker compose -f compose.proxied.yml up -d
```

Configure your proxy to serve HTTPS and forward requests to `127.0.0.1:8080`. It must set `X-Forwarded-For` and `X-Forwarded-Proto`. If the proxy runs in another container, use `SWEET_BIND` and `SWEET_PORT` to make Sweet reachable from it.

### Email

Fill in the `SWEET_SMTP_` settings in `.env` with your email provider's SMTP host, port, username and password. Set `SWEET_MAIL_FROM` to an address the provider allows you to send from. Run `docker compose up -d` to apply the settings.

Without SMTP settings, Sweet writes each email to a file in the data volume instead of sending it. `docker compose exec sweet ls /data/mail` lists them and `docker compose exec sweet cat /data/mail/<file>` shows one.

### The bucket: images and backups

Create a private bucket with an S3-compatible storage provider. Create credentials with read and write access to that bucket. Add the provider's connection details to `.env`:

```
SWEET_S3_ENDPOINT=<endpoint hostname, without https://>
SWEET_S3_BUCKET=<bucket name>
SWEET_S3_ACCESS_KEY=<access key id>
SWEET_S3_SECRET_KEY=<secret access key>
```

Set `SWEET_S3_REGION` if your provider requires a region. Run `docker compose up -d` to apply the settings. Images are stored in the bucket under `images/` and the database is replicated to it under `db/`, a second or so behind. The bucket keeps 30 days of history, with a full copy every hour (see Restoring). The bucket and your `.env` together are the whole backup, so keep a copy of `.env` somewhere safe.

Several instances can share one bucket if each has its own folder in it. `SWEET_S3_FOLDER=<name>` puts that instance's images under `<name>/images` and its database under `<name>/db`.

### Upgrading

```
cd sweet
git pull
cd deploy
docker compose pull
docker compose up -d
```

`git pull` updates the compose files, and `docker compose pull` downloads the new image. To run a particular release instead of the latest image, set `SWEET_IMAGE=ghcr.io/lowercasename/sweet-community:<version>` in `.env`, such as `1.0.0`. Then an upgrade is a change of that line. Before a migration changes the database schema, Sweet copies the database to `sweet.db.before-upgrade` in the same volume. Open browser tabs reload automatically when the new version starts.

### Restoring

- **The server is gone.** On a new one, install as above with the same `.env`. Sweet finds no database, fetches the latest from the bucket and starts. The images are already there.
- **An upgrade went wrong.** Stop Sweet with `docker compose down`. If a migration failed, its changes were rolled back, so the earlier release can use the current database. If migrations succeeded but you need to undo the upgrade, first restore the upgrade backup using the current image:

  ```
  docker compose run --rm --no-deps --entrypoint sweet sweet -db /data/sweet.db -restore-from /data/sweet.db.before-upgrade
  ```

  This discards changes made since that backup. After a successful restore, put the release you were on in `.env`, for example `SWEET_IMAGE=ghcr.io/lowercasename/sweet-community:1.0.0`, then run `docker compose up -d`. If no restore was needed, change the version and start it directly. The nav shows the release under Collapse, and `CHANGELOG.md` lists them all.
- **Something was deleted and you want the database as it was at a moment.** Any moment in the last 30 days can be restored. Stop Sweet, restore the database as of that moment (UTC), start it:

  ```
  docker compose stop sweet
  docker compose run --rm --no-deps sweet restore 2026-11-06T18:00:00Z
  docker compose up -d sweet
  ```

  Without a timestamp, `restore` fetches the latest.

Both restore commands check the replacement before installing it. A failed download or invalid backup leaves the current database unchanged. On success, the previous database and its SQLite companion files stay in a new `/data/sweet.db.before-restore-*` directory. The command prints its location. These copies contain private community data. Remove them when recovery is complete.

Keep Sweet and Litestream stopped throughout a restore. Start Sweet only after the restore command succeeds. Restoring the database does not recover images already deleted from the bucket.

### Without Docker

`make build` produces `bin/sweet`, one file with the frontend and the migrations inside it. It takes the same settings from the environment, and `./bin/sweet -help` lists its flags. Put a reverse proxy in front of it and set `SWEET_TRUST_PROXY` to the number of proxies in front of Sweet, usually `1`. Sweet uses that number to find the visitor's address in `X-Forwarded-For` for its rate limits. If you run Litestream yourself, start Sweet with `SWEET_LITESTREAM=1` so it leaves checkpointing to Litestream.

## Develop

Install Go, Node.js and pnpm. The required Go version is in `go.mod`.

Start the frontend from the repository root:

```
cd web
pnpm install --frozen-lockfile
pnpm dev
```

In a second terminal, start the backend from the repository root:

```
make dev-backend
```

Open `http://localhost:5173`. The frontend forwards API requests to the backend on port 8080.

On a fresh database, the backend prints a `SETUP:` link. Open it to create your account. Leave `SWEET_OWNER_PASSWORD` unset to use this setup flow. Without SMTP settings, sign-in emails are saved in `data/mail`.

For optional settings, copy `.env.example` to `.env` and edit it. The Make targets load this file. It is ignored by Git.

### Run the built app

From the repository root:

```
make run
```

This builds and starts the app at `http://localhost:8080`. To build without starting it, use `make build`. Run `./bin/sweet -help` for the available flags.

### Tests and generated code

Use focused checks for the code you change. Backend tests use `go test`. Frontend unit tests use Vitest, and browser tests use Playwright. The commands are listed in [web/README.md](web/README.md).

After changing SQL queries or the database schema, run `make generate`. It regenerates the Go query code with sqlc. No separate sqlc installation is needed.

### Releases

Run the complete checks from the repository root before tagging or pushing a release:

```
make build
go vet ./...
go test ./...
(cd web && pnpm typecheck && pnpm check:atomic && pnpm format:check && pnpm test)
make e2e
```

After they pass, commit any changes and run `make release KIND=patch` from a clean `main` checkout. The command updates `CHANGELOG.md`, commits it, tags the release and pushes. Use `minor` for new features and `major` for changes that require operators to act. Bug fixes, including security and privacy corrections, are patch releases regardless of the size of the code change.

CI runs the unit checks and selected sign-in and privacy browser tests before publishing the image. A failed check blocks publication. These CI checks do not replace the complete browser suite before a release.

## Layout

```
cmd/sweet/          application entry point
deploy/             Docker deployment and backup configuration
internal/api/       HTTP handlers
internal/auth/      authentication
internal/db/        database setup, migrations and restore
internal/digest/    weekly email digests
internal/events/    event storage and realtime delivery
internal/images/    image processing and storage
internal/mail/      email delivery
internal/perm/      permission rules
internal/push/      push notifications
internal/sanitize/  content sanitisation
internal/store/     database queries
internal/version/   application version
internal/web/       embedded frontend
migrations/         database migrations
web/                web client
```

## Licence

Sweet is free software. You can share it and change it under the terms of the GNU Affero General Public License, version 3 or any later version, as published by the Free Software Foundation. The full text is in [LICENSE](LICENSE).

If you run a changed version of Sweet for other people, the licence requires you to offer them the source code of your version. Set `SWEET_SOURCE_URL` to your repository, and the Source code link at the bottom of Home's feed points there.
