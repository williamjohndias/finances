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
CREATE TABLE public.dinheiro_guardado(id text PRIMARY KEY, amount numeric);
CREATE TABLE public.reserva_movimentos(id text PRIMARY KEY, amount numeric);
INSERT INTO public.transactions VALUES('historical-income',100),('historical-expense',-30);
INSERT INTO public.abatimentos VALUES('actual-card-payment',30);
INSERT INTO public.dinheiro_guardado VALUES('current-reserve',70);
INSERT INTO public.reserva_movimentos VALUES('reserve-movement',70);
GRANT ALL ON public.transactions, public.abatimentos, public.dinheiro_guardado,
    public.reserva_movimentos TO PUBLIC, anon, authenticated, service_role;
CREATE POLICY "Allow all operations" ON public.transactions FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations abatimentos" ON public.abatimentos FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations dinheiro_guardado" ON public.dinheiro_guardado FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations reserva_movimentos" ON public.reserva_movimentos FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abatimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dinheiro_guardado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserva_movimentos ENABLE ROW LEVEL SECURITY;
SQL
sql < migrations/001_open_finance_staging.sql
sql < migrations/002_open_finance_sync.sql
sql < tests/open_finance_database.sql
sql < migrations/003_open_finance_release.sql
sql < tests/open_finance_release.sql
sql < migrations/004_harden_legacy_data_api.sql
sql <<'SQL'
CREATE FUNCTION public.test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END $$;
SELECT public.test_assert(
    NOT has_table_privilege('anon','public.transactions','SELECT') AND
    NOT has_table_privilege('authenticated','public.abatimentos','INSERT') AND
    NOT has_table_privilege('anon','public.dinheiro_guardado','UPDATE') AND
    NOT has_table_privilege('authenticated','public.reserva_movimentos','DELETE'),
    'legacy Data API is closed to public roles');
SELECT public.test_assert(
    has_table_privilege('service_role','public.transactions','SELECT') AND
    has_table_privilege('service_role','public.abatimentos','INSERT') AND
    has_table_privilege('service_role','public.dinheiro_guardado','UPDATE') AND
    has_table_privilege('service_role','public.reserva_movimentos','DELETE'),
    'Vercel backend retains legacy ledger access');
SELECT public.test_assert(NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('transactions','abatimentos','dinheiro_guardado','reserva_movimentos')
      AND (qual='true' OR with_check='true')),
    'permissive legacy RLS policies are removed');
DROP FUNCTION public.test_assert(boolean,text);
SQL
