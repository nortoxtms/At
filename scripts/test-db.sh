#!/usr/bin/env bash
# ONLY HORSES · database test suite
#
# Rebuilds the schema from scratch, then runs the SQL suites:
#   smoke.sql  — §7 triggers and §13.3 scoring, as the owner
#   rls.sql    — §24.23 cross-tenant reads, as the *application* role, which
#                is the only way the assertions mean anything (ADR-0004)
set -euo pipefail

OWNER_URL="${DIRECT_URL:?set DIRECT_URL to the owner connection string}"
APP_URL="${DATABASE_URL:?set DATABASE_URL to the application role connection string}"

echo "· rebuilding schema"
node "$(dirname "$0")/migrate.mjs" --reset >/dev/null

echo "· smoke.sql"
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f db/tests/smoke.sql

echo "· rls.sql"
psql "$APP_URL" -v ON_ERROR_STOP=1 -q -f db/tests/rls.sql

echo "✓ database tests passed"
