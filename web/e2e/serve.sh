#!/bin/sh
# Build the frontend and run the binary on a fresh database, for Playwright.
set -e
cd "$(dirname "$0")/.."
pnpm build > /dev/null
cd ..
# go:embed needs the migrations copied beside the binary, as make build does.
make cmd/sweet/migrations > /dev/null
# The Makefile exports the local .env. Its bucket settings would send the tests' images to a real bucket, so they are
# cleared and images go to the local directory.
unset SWEET_S3_ENDPOINT SWEET_S3_BUCKET SWEET_S3_ACCESS_KEY SWEET_S3_SECRET_KEY SWEET_S3_REGION SWEET_S3_PREFIX SWEET_S3_FOLDER SWEET_S3_INSECURE
rm -rf data/e2e.db data/e2e.db-shm data/e2e.db-wal data/e2e-images data/e2e-mail
mkdir -p data
SWEET_OWNER_PASSWORD='correct horse' exec go run ./cmd/sweet -addr 127.0.0.1:8098 -db data/e2e.db -images-dir data/e2e-images -mail-dir data/e2e-mail -base-url http://127.0.0.1:8098 -owner raphael
