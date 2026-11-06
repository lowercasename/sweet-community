#!/bin/sh
# A second instance, as one starts for the first time: no owner, so it prints
# a setup link, which the setup flow's test reads from this log. Built by
# serve.sh already (the frontend and the migrations copy), so only the binary.
set -e
cd "$(dirname "$0")/../.."
rm -rf data/e2e-fresh.db data/e2e-fresh.db-shm data/e2e-fresh.db-wal data/e2e-fresh-images data/e2e-fresh-mail data/e2e-fresh.log
mkdir -p data
# The Makefile exports Raphael's .env, SWEET_OWNER_PASSWORD included; this instance must have no owner.
SWEET_OWNER_PASSWORD= exec go run ./cmd/sweet -addr 127.0.0.1:8097 -db data/e2e-fresh.db -images-dir data/e2e-fresh-images -mail-dir data/e2e-fresh-mail -base-url http://127.0.0.1:8097 > data/e2e-fresh.log 2>&1
