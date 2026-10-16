-- Synthetic fixtures only. Executed exclusively by run_postgres.sh.
CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END $$;

SELECT public.test_assert((SELECT bool_and(relrowsecurity) FROM pg_class
    WHERE relname IN ('of_consents','of_items','of_accounts','of_events','open_finance_transactions')),
    'RLS enabled on all five staging tables');
SELECT public.test_assert(NOT has_table_privilege('anon','of_accounts','SELECT') AND
    NOT has_table_privilege('authenticated','open_finance_transactions','SELECT'), 'public grants denied');
SELECT public.test_assert(NOT has_table_privilege('service_role','of_accounts','DELETE') AND
    NOT has_table_privilege('service_role','open_finance_transactions','DELETE'),'staging backend has no delete grant');
SELECT public.test_assert(NOT has_function_privilege('authenticated','of_claim_sync()','EXECUTE') AND
    NOT has_function_privilege('anon','of_stage_page(text,uuid,text,jsonb,text)','EXECUTE'), 'RPC execution denied to clients');
SET ROLE authenticated;
DO $$ BEGIN
    BEGIN PERFORM * FROM public.of_accounts; RAISE EXCEPTION 'Read unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM public.of_claim_sync(); RAISE EXCEPTION 'RPC unexpectedly allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Even a future accidental SELECT grant must still fail closed through RLS.
GRANT SELECT ON public.of_accounts TO authenticated;
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*)=0 FROM public.of_accounts),'RLS has no client read policy');
RESET ROLE;
REVOKE SELECT ON public.of_accounts FROM authenticated;

SET ROLE service_role;
INSERT INTO public.of_consents(id,owner_id,client_user_id,expires_at) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','binding-one',now()+interval '1 day'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','binding-two',now()+interval '1 day');
SELECT public.of_bind_item('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','item-one','binding-one','Synthetic Bank');
SELECT public.of_bind_item('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','item-two','binding-two','Synthetic Bank');
DO $$ BEGIN
    BEGIN
        PERFORM public.of_bind_item('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','item-one','binding-two','Synthetic');
        RAISE EXCEPTION 'Ownership unexpectedly changed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM='Ownership unexpectedly changed' THEN RAISE; END IF;
    END;
END $$;
SELECT public.test_assert((SELECT owner_id='11111111-1111-1111-1111-111111111111' FROM public.of_items WHERE id='item-one'),
    'binding cannot transfer item ownership');
SELECT public.of_claim_sync();
SELECT public.of_claim_sync();
SELECT public.test_assert((SELECT count(*)=0 FROM public.of_claim_sync()),'active leases cannot be claimed twice');
SELECT public.of_stage_account('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),
    '{"id":"account-one","kind":"BANK","currency":"BRL","balance":100}');
SELECT public.of_stage_account('item-two',(SELECT lease FROM public.of_items WHERE id='item-two'),
    '{"id":"account-two","kind":"CREDIT","currency":"BRL","balance":-40}');

DO $$ BEGIN
    BEGIN
        PERFORM public.of_stage_account('item-two',(SELECT lease FROM public.of_items WHERE id='item-two'),
            '{"id":"account-one","kind":"BANK","currency":"BRL","balance":999}');
        RAISE EXCEPTION 'Account unexpectedly stolen';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM='Account unexpectedly stolen' THEN RAISE; END IF;
    END;
END $$;
SELECT public.test_assert((SELECT balance=100 FROM public.of_accounts WHERE id='account-one'),'account cannot be stolen across owners');

SELECT public.of_stage_page('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),'account-one',
    '[{"external_id":"tx-one","bank_status":"PENDING","amount":10,"currency":"BRL","occurred_at":"2026-10-16T12:00:00Z","direction":"DEBIT"}]','cursor-one');
UPDATE public.open_finance_transactions SET reconciliation_status='matched' WHERE external_id='tx-one';
SELECT public.of_stage_page('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),'account-one',
    '[{"external_id":"tx-one","bank_status":"POSTED","amount":10,"currency":"BRL","occurred_at":"2026-10-16T12:00:00Z","direction":"DEBIT"}]',NULL);
SELECT public.test_assert((SELECT count(*)=1 AND bool_and(bank_status='POSTED' AND reconciliation_status='matched')
    FROM public.open_finance_transactions WHERE external_id='tx-one'),'pending update idempotent; reconciliation preserved');
SELECT public.test_assert((SELECT cursor IS NULL AND last_synced_at IS NOT NULL FROM public.of_accounts WHERE id='account-one'),
    'terminal page resets cursor for future pending updates');

DO $$ BEGIN
    BEGIN
        PERFORM public.of_stage_page('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),'account-one',
            '[{"external_id":"bad","bank_status":"POSTED","amount":"invalid"}]','bad-cursor');
        RAISE EXCEPTION 'Bad page unexpectedly committed';
    EXCEPTION WHEN invalid_text_representation THEN NULL; END;
END $$;
SELECT public.test_assert((SELECT cursor IS NULL FROM public.of_accounts WHERE id='account-one') AND
    NOT EXISTS(SELECT 1 FROM public.open_finance_transactions WHERE external_id='bad'),'failed page rolls back data and checkpoint');

DO $$ BEGIN
    BEGIN
        PERFORM public.of_stage_page('item-one','00000000-0000-0000-0000-000000000000','account-one','[]','stale');
        RAISE EXCEPTION 'Stale lease unexpectedly committed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM='Stale lease unexpectedly committed' THEN RAISE; END IF;
    END;
END $$;
SELECT public.test_assert((SELECT cursor IS NULL FROM public.of_accounts WHERE id='account-one'),'stale worker cannot overwrite checkpoint');

-- Legacy stage-one payloads stay quarantined instead of being assigned silently.
INSERT INTO public.open_finance_transactions(provider,item_id,account_id,external_id,bank_status,payload)
    VALUES('pluggy','item-one','account-one','quarantined','PENDING','{}');
DO $$ BEGIN
    BEGIN
        PERFORM public.of_stage_page('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),'account-one',
            '[{"external_id":"quarantined","bank_status":"POSTED","amount":10,"currency":"BRL","occurred_at":"2026-10-16T12:00:00Z","direction":"DEBIT"}]','unexpected');
        RAISE EXCEPTION 'Quarantine unexpectedly adopted';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM='Quarantine unexpectedly adopted' THEN RAISE; END IF;
    END;
END $$;
SELECT public.test_assert((SELECT owner_id IS NULL AND bank_status='PENDING' FROM public.open_finance_transactions
    WHERE external_id='quarantined'),'legacy staging remains unowned on collision');
SELECT public.test_assert((SELECT cursor IS NULL FROM public.of_accounts WHERE id='account-one'),
    'quarantine conflict does not advance cursor');

SELECT public.of_finish_sync('item-one',(SELECT lease FROM public.of_items WHERE id='item-one'),true,false);
SELECT public.of_enqueue_event('event-one','item-one');
UPDATE public.of_items SET sync_requested=false WHERE id='item-one';
SELECT public.of_enqueue_event('event-one','item-one');
SELECT public.of_enqueue_event('unknown-event','unknown-item');
SELECT public.test_assert((SELECT count(*)=1 FROM public.of_events) AND
    (SELECT NOT sync_requested FROM public.of_items WHERE id='item-one'),'webhook replay idempotent; unknown item ignored');

UPDATE public.of_consents SET revoked_at=now() WHERE client_user_id='binding-two';
DO $$ BEGIN
    BEGIN
        PERFORM public.of_stage_page('item-two',(SELECT lease FROM public.of_items WHERE id='item-two'),'account-two','[]','revoked');
        RAISE EXCEPTION 'Revoked consent unexpectedly committed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM='Revoked consent unexpectedly committed' THEN RAISE; END IF;
    END;
END $$;
SELECT public.test_assert((SELECT cursor IS NULL FROM public.of_accounts WHERE id='account-two'),'revoked consent blocks writes');
SELECT public.of_finish_sync('item-two',(SELECT lease FROM public.of_items WHERE id='item-two'),false,true);
SELECT public.test_assert((SELECT error_code='provider_unavailable' AND next_attempt_at>now() AND lease IS NULL
    FROM public.of_items WHERE id='item-two'),'failure releases lease and enforces cooldown without provider detail');
SELECT public.test_assert((SELECT count(*)=0 FROM public.of_claim_sync()),'revoked items excluded from scheduler');
RESET ROLE;

-- Demonstrate RLS with real nonempty staging, not only empty tables.
GRANT SELECT ON public.of_accounts,public.open_finance_transactions TO anon,authenticated;
SET ROLE authenticated;
SELECT public.test_assert((SELECT count(*)=0 FROM public.of_accounts) AND
    (SELECT count(*)=0 FROM public.open_finance_transactions),'RLS hides nonempty bank data');
RESET ROLE;
REVOKE SELECT ON public.of_accounts,public.open_finance_transactions FROM anon,authenticated;
SELECT public.test_assert((SELECT count(*)=2 AND sum(amount)=70 FROM public.transactions) AND
    (SELECT count(*)=1 AND sum(amount)=30 FROM public.abatimentos),'legacy history and actual card payments unchanged');
SELECT public.test_assert((SELECT count(*)=2 FROM public.open_finance_transactions),'only collected and quarantined staging rows exist');
DROP FUNCTION public.test_assert(boolean,text);
