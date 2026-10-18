-- Remove the legacy public Data API surface before the FINANCES 2.0 cutover.
-- The Vercel backend uses a Supabase secret key (service_role) and keeps access.
BEGIN;

DROP POLICY IF EXISTS "Allow all operations" ON public.transactions;
DROP POLICY IF EXISTS "Allow all operations abatimentos" ON public.abatimentos;
DROP POLICY IF EXISTS "Allow all operations dinheiro_guardado" ON public.dinheiro_guardado;
DROP POLICY IF EXISTS "Allow all operations reserva_movimentos" ON public.reserva_movimentos;

REVOKE ALL ON TABLE public.transactions, public.abatimentos,
    public.dinheiro_guardado, public.reserva_movimentos
    FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.transactions, public.abatimentos,
    public.dinheiro_guardado, public.reserva_movimentos
    TO service_role;

COMMIT;
