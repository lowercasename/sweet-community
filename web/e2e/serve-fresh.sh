#!/bin/sh
# A second instance, as one starts for the first time: no owner, so it prints
# a setup link, which the setup flow's test reads from this log. Built by
# serve.sh already (the frontend and the migrations copy), so only the binary.
set -e
cd "$(dirname "$0")/../.."
# The Makefile exports the local .env. Its bucket settings would send the tests' images to a real bucket, so they are
# cleared and images go to the local directory.
unset SWEET_S3_ENDPOINT SWEET_S3_BUCKET SWEET_S3_ACCESS_KEY SWEET_S3_SECRET_KEY SWEET_S3_REGION SWEET_S3_PREFIX SWEET_S3_FOLDER SWEET_S3_INSECURE
rm -rf data/e2e-fresh.db data/e2e-fresh.db-shm data/e2e-fresh.db-wal data/e2e-fresh-images data/e2e-fresh-mail data/e2e-fresh.log
mkdir -p data
# The Makefile exports the local .env, including SWEET_OWNER_PASSWORD. This instance must have no owner.
SWEET_OWNER_PASSWORD= exec go run ./cmd/sweet -addr 127.0.0.1:8097 -db data/e2e-fresh.db -images-dir data/e2e-fresh-images -mail-dir data/e2e-fresh-mail -base-url http://127.0.0.1:8097 > data/e2e-fresh.log 2>&1
