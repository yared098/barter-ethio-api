#!/bin/sh
set -eu

echo "[entrypoint] Applying database migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Starting API..."
exec "$@"
