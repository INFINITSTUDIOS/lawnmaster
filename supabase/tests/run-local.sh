#!/usr/bin/env bash
# Applies the migrations to a throwaway local database and runs the SQL tests.
# Usage: supabase/tests/run-local.sh [psql connection args]
set -euo pipefail
cd "$(dirname "$0")/.."
DB=lawnmaster_test
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@")
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f tests/00_local_stubs.sql
for f in migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
"${PSQL[@]}" -d "$DB" -v company_a= -f tests/01_schema_test.sql
