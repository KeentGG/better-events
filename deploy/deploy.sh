#!/usr/bin/env bash
# Build here, ship to the VPS, migrate, restart. Usage: deploy/deploy.sh [ssh-host]
set -euo pipefail
HOST="${1:-ubuntu@your-vps-host}"
cd "$(dirname "$0")/.."

npm run build
rsync -az --delete dist/ "$HOST:/tmp/masskara-dist/"
rsync -az --delete --exclude node_modules --exclude dist --exclude .env --exclude '*.local' --exclude .git --exclude .claude --exclude .wrangler --exclude screenshots \
  ./ "$HOST:/tmp/masskara-app/"

ssh "$HOST" 'set -e
sudo rsync -a --delete --exclude .env --exclude node_modules /tmp/masskara-app/ /srv/masskara/app/
sudo rsync -a --delete /tmp/masskara-dist/ /srv/masskara/dist/
sudo chown -R masskara:masskara /srv/masskara/app /srv/masskara/dist
cd /srv/masskara/app
sudo -u masskara npm ci --no-audit --no-fund --loglevel=error
sudo -u masskara bash -c "set -a; . ./.env; set +a; npx drizzle-kit migrate"
sudo systemctl restart masskara-api
sleep 2; systemctl is-active masskara-api'
