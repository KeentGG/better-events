#!/usr/bin/env bash
# Rebuild masskara_demo from the local masskara database and pin it to the demo night.
# The clone is dropped and copied fresh each run; nothing is written back to masskara.
set -euo pipefail
cd "$(dirname "$0")/.."

container=masskara-pg
source_db=masskara
demo_db=masskara_demo
demo_url=postgres://postgres:postgres@localhost:55432/masskara_demo
demo_now=2026-10-17T21:00:00+08:00

if ! docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
  echo "demo:db: container $container is not running. Start the local Postgres first." >&2
  exit 1
fi

# Drop and recreate rather than CREATE DATABASE ... TEMPLATE: the source may still have connections.
docker exec "$container" dropdb -U postgres --if-exists --force "$demo_db"
docker exec "$container" createdb -U postgres "$demo_db"

# Copy in, keeping the same schema and data. Owners and grants are the container's own.
docker exec "$container" pg_dump -U postgres --no-owner --no-privileges "$source_db" \
  | docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q "$demo_db"

# Prune everything after the pin. The script refuses to run unless the database name contains "demo".
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 "$demo_db" < server/db/demo-pin.sql

# Put that night's historical forecast back into weather_snapshots.
DEMO_NOW="$demo_now" DATABASE_URL="$demo_url" ./node_modules/.bin/tsx server/db/demo-weather.ts

echo "demo:db: $demo_db is ready at $demo_url"
