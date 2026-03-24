#!/usr/bin/env bash
set -euo pipefail

# Apply all SQL functions to the database.
# Usage: ./prisma/functions/apply-all.sh
# Requires DATABASE_URL to be set (or uses .env via dotenv-cli).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for sql_file in "$SCRIPT_DIR"/*.sql; do
  echo "Applying $(basename "$sql_file")..."
  psql "$DATABASE_URL" -f "$sql_file"
done

echo "All SQL functions applied."
