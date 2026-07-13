#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
npm ci --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --env production
  pm2 save
else
  echo "PM2 is not installed. Install it once with: sudo npm install -g pm2"
  exit 1
fi
