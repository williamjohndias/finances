#!/usr/bin/env bash
# Only operates on a new network-isolated Docker container; no remote DB input.
set -euo pipefail
cd "$(dirname "$0")/.."
container="finances-of-test-${RANDOM}-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$container" --network none \
    -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine >/dev/null
ready=false
for attempt in {1..30}; do
    if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
        ready=true; break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then echo 'Disposable PostgreSQL did not start' >&2; exit 1; fi
sql() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres; }
sql <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES('11111111-1111-1111-1111-111111111111'),
    ('22222222-2222-2222-2222-222222222222');
-- Sentinel legacy data must survive both migrations and every sync operation.
CREATE TABLE public.transactions(id text PRIMARY KEY, amount numeric);
CREATE TABLE public.abatimentos(id text PRIMARY KEY, amount numeric);
INSERT INTO public.transactions VALUES('historical-income',100),('historical-expense',-30);
INSERT INTO public.abatimentos VALUES('actual-card-payment',30);
SQL
sql < migrations/001_open_finance_staging.sql
sql < migrations/002_open_finance_sync.sql
sql < tests/open_finance_database.sql
