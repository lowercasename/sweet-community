.PHONY: build run dev-backend frontend test clean

# go:embed cannot reference a parent directory, so migrations/ is the source
# of truth and is copied beside main.go at build time.
cmd/sweet/migrations: migrations/*.sql
	rm -rf cmd/sweet/migrations && cp -R migrations cmd/sweet/migrations

frontend:
	cd web && pnpm install --frozen-lockfile && pnpm build

build: cmd/sweet/migrations frontend
	mkdir -p bin && go build -o bin/sweet ./cmd/sweet

# Backend only, serving whatever is in internal/web/dist (placeholder until
# the frontend is built). Pair with `cd web && pnpm dev` for live reload.
dev-backend: cmd/sweet/migrations
	go run ./cmd/sweet -db data/sweet.db -owner raphael -owner-password "$${SWEET_OWNER_PASSWORD}"

run: build
	./bin/sweet -db data/sweet.db -owner raphael

test: cmd/sweet/migrations
	go test ./...

clean:
	rm -rf bin cmd/sweet/migrations internal/web/dist/assets
