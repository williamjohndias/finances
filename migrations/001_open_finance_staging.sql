-- REVIEW ONLY. Do not execute against production without explicit approval.
-- Additive staging only: no changes to transactions, abatimentos or projections.
BEGIN;
CREATE TABLE public.open_finance_transactions (
    provider text NOT NULL CHECK (provider = 'pluggy'),
    item_id text NOT NULL,
    account_id text NOT NULL,
    external_id text NOT NULL,
    bank_status text NOT NULL CHECK (bank_status IN ('POSTED', 'PENDING', 'UNKNOWN')),
    reconciliation_status text NOT NULL DEFAULT 'unreviewed'
        CHECK (reconciliation_status IN ('unreviewed', 'matched', 'excluded')),
    payload jsonb NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, account_id, external_id)
);
-- Bank data is server-only. Deliberately no anon/authenticated RLS policies.
ALTER TABLE public.open_finance_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.open_finance_transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.open_finance_transactions TO service_role;
COMMENT ON TABLE public.open_finance_transactions IS
    'Unreconciled bank data; excluded from all FINANCES balances and projections';
COMMIT;
-- Rollback for review only: DROP TABLE public.open_finance_transactions;
-- Dropping staging loses collected data; prefer disabling the feature flag.
