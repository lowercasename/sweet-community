.PHONY: build run dev-backend frontend test clean release

# go:embed cannot reference a parent directory, so migrations/ is the source
# of truth and is copied beside main.go at build time.
cmd/sweet/migrations: migrations/*.sql
	rm -rf cmd/sweet/migrations && cp -R migrations cmd/sweet/migrations

# The release the nav names: the newest tag, or the commit after it.
RELEASE := $(shell git describe --tags --always --dirty 2>/dev/null)
LDFLAGS := -X sweet/internal/version.release=$(RELEASE)

frontend:
	cd web && pnpm install --frozen-lockfile && pnpm build

build: cmd/sweet/migrations frontend
	mkdir -p bin && go build -ldflags "$(LDFLAGS)" -o bin/sweet ./cmd/sweet

# Backend only, serving whatever is in internal/web/dist (placeholder until
# the frontend is built). Pair with `cd web && pnpm dev` for live reload.
# Local settings (owner password, S3/R2 keys) live in a gitignored .env; see .env.example.
-include .env
export

dev-backend: cmd/sweet/migrations
	go run -ldflags "$(LDFLAGS)" ./cmd/sweet -db data/sweet.db -owner raphael -base-url http://localhost:5173

run: build
	./bin/sweet -db data/sweet.db -owner raphael

generate:
	go tool sqlc generate

test: cmd/sweet/migrations
	go test ./...

clean:
	rm -rf bin cmd/sweet/migrations internal/web/dist/assets

# Releases main as the next version: make release KIND=patch, minor or major, or KIND=v1.0.0 for a version by name.
release:
	sh scripts/release.sh $(KIND)

# Playwright tests in a real browser, against the built binary and the Vite dev server.
e2e:
	cd web && pnpm e2e
