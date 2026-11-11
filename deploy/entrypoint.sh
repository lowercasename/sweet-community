#!/bin/sh
# The container's entrypoint.
#
#   sweet-entrypoint [flags]              start Sweet
#   sweet-entrypoint restore [timestamp]  put the database back from the bucket
#
# With a bucket configured, Litestream restores the database when the disk has
# none, then replicates it while Sweet runs.
set -e

data=${SWEET_DATA:-/data}
db=$data/sweet.db
mkdir -p "$data"

if [ -z "$SWEET_S3_BUCKET" ]; then
  if [ "$1" = restore ]; then
    echo "restore: no bucket is configured (SWEET_S3_BUCKET)" >&2
    exit 1
  fi
  exec sweet -addr :8080 -db "$db" -images-dir "$data/images" -mail-dir "$data/mail" "$@"
fi

if [ -z "$SWEET_S3_ENDPOINT" ] || [ -z "$SWEET_S3_ACCESS_KEY" ] || [ -z "$SWEET_S3_SECRET_KEY" ]; then
  echo "SWEET_S3_BUCKET is set, but SWEET_S3_ENDPOINT, SWEET_S3_ACCESS_KEY or SWEET_S3_SECRET_KEY is empty." >&2
  echo "Fill them in, or leave all four empty to run without a bucket (images on disk, no backups)." >&2
  exit 1
fi

# Images go under images/ and the database under db/ in the same bucket. SWEET_S3_FOLDER puts both under one
# folder, <folder>/images and <folder>/db, so several instances can share a bucket.
folder=${SWEET_S3_FOLDER:+${SWEET_S3_FOLDER%/}/}
export SWEET_S3_PREFIX=${SWEET_S3_PREFIX:-${folder}images}
export SWEET_S3_DB_PATH=${folder}db
export SWEET_S3_REGION=${SWEET_S3_REGION:-auto}
if [ "$SWEET_S3_INSECURE" = 1 ]; then
  export SWEET_S3_URL="http://$SWEET_S3_ENDPOINT"
else
  export SWEET_S3_URL="https://$SWEET_S3_ENDPOINT"
fi
export SWEET_DATA=$data
export SWEET_LITESTREAM=1

if [ "$1" = restore ]; then
  stage=$(mktemp -d "$data/.sweet-download-XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  trap 'exit 1' HUP INT TERM
  if [ -n "$2" ]; then
    litestream restore -config /etc/litestream.yml -timestamp "$2" -o "$stage/sweet.db" "$db"
  else
    litestream restore -config /etc/litestream.yml -o "$stage/sweet.db" "$db"
  fi
  sweet -db "$db" -restore-from "$stage/sweet.db"
  exit
fi

litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$db"
exec litestream replicate -config /etc/litestream.yml \
  -exec "sweet -addr :8080 -db $db -images-dir $data/images -mail-dir $data/mail $*"
