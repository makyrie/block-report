#!/usr/bin/env bash
set -euo pipefail

# Safe migration script — run this BEFORE deploying, not during build.
# Uses Prisma's built-in migration tracking to skip already-applied migrations.
# Safe to re-run: prisma migrate deploy is idempotent for successful migrations.
#
# Usage:
#   pnpm db:migrate:safe
#
# For CI/CD, run this as a separate step before the build step.

echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."
