CREATE FUNCTION public.test_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END $$;
SELECT public.test_assert(NOT has_table_privilege('service_role','of_audit','UPDATE') AND
    NOT has_table_privilege('service_role','of_audit','DELETE'),'audit is append only for backend');
SELECT public.test_assert(NOT has_function_privilege('authenticated','of_decide(uuid,text,uuid,jsonb)','EXECUTE') AND
    NOT has_table_privilege('anon','of_legacy_ownership','SELECT'),'reconciliation and legacy ownership are server only');
SET ROLE service_role;
INSERT INTO public.of_user_bindings VALUES('11111111-1111-1111-1111-111111111111','sandbox','release-binding');
SELECT public.test_assert((public.of_new_consent('11111111-1111-1111-1111-111111111111','sandbox')->>'client_user_id')=
 (public.of_new_consent('11111111-1111-1111-1111-111111111111','sandbox')->>'client_user_id'),
 'repeated Connect attempts use a stable owner binding for provider deduplication');
INSERT INTO public.of_consents(id,owner_id,client_user_id,expires_at) VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','release-binding',now()+interval '1 day'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111','prod-binding',now()+interval '1 day');
SELECT public.of_bind_item_v3('11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','release-item','release-binding','Synthetic Nubank','sandbox');
SELECT public.of_bind_item_v3('11111111-1111-1111-1111-111111111111','dddddddd-dddd-dddd-dddd-dddddddddddd','production-item','prod-binding','Synthetic Production','production');
SELECT public.of_claim_sync_v3('sandbox');
SELECT public.test_assert((SELECT lease IS NULL FROM public.of_items WHERE id='production-item'),'sandbox scheduler does not claim production');
SELECT public.of_stage_account('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),
 '{"id":"bank-a","kind":"BANK","currency":"BRL","balance":1234}');
SELECT public.of_stage_account('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),
 '{"id":"bank-b","kind":"BANK","currency":"BRL","balance":50}');
SELECT public.of_stage_account('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),
 '{"id":"card-a","kind":"CREDIT","currency":"BRL","balance":-100}');
SELECT public.of_stage_page('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),'bank-a',
 '[{"external_id":"salary","bank_status":"POSTED","amount":1000,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT","metadata":{"category_id":"salary-category"}},
 {"external_id":"bill-paid","bank_status":"POSTED","amount":100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"DEBIT"},
 {"external_id":"transfer-out","bank_status":"POSTED","amount":50,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"DEBIT"},
 {"external_id":"uncertain","bank_status":"POSTED","amount":20,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"DEBIT"},
 {"external_id":"pending","bank_status":"PENDING","amount":30,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"DEBIT"},
 {"external_id":"older-salary","bank_status":"POSTED","amount":100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT","metadata":{"category_id":"salary-category"}}]',NULL);
SELECT public.of_stage_page('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),'bank-b',
 '[{"external_id":"transfer-in","bank_status":"POSTED","amount":50,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT"}]',NULL);
SELECT public.of_stage_page('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),'card-a',
 '[{"external_id":"card-payment","bank_status":"POSTED","amount":100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT"},
 {"external_id":"purchase","bank_status":"POSTED","amount":100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"DEBIT","metadata":{"semantic_hint":"card_purchase"}}]',NULL);
INSERT INTO public.of_legacy_ownership(source,legacy_id,owner_id,data_scope,snapshot) VALUES
 ('abatimentos','actual-card-payment','11111111-1111-1111-1111-111111111111','sandbox','{"id":"actual-card-payment","valor":100,"data":"2025-01-01"}');
SELECT public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000001',
 '{"account_id":"bank-a","external_id":"salary","revision":1,"kind":"income","reason":"Verified salary category","save_rule":true}');
SELECT public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000001',
 '{"account_id":"bank-a","external_id":"salary","revision":1,"kind":"income","reason":"Verified salary category","save_rule":true}');
SELECT public.test_assert((SELECT count(*)=1 FROM public.of_audit WHERE request_id='10000000-0000-0000-0000-000000000001'),
 'reconciliation retries keep one audit decision');
SELECT public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000002',
 '{"account_id":"bank-a","external_id":"bill-paid","revision":1,"kind":"invoice_payment","reason":"Verified invoice settlement","other_account_id":"card-a","other_external_id":"card-payment","other_revision":1,"legacy_table":"abatimentos","legacy_id":"actual-card-payment"}');
SELECT public.test_assert((SELECT count(*)=2 FROM public.of_reconciliations WHERE kind='invoice_payment'),
 'invoice debit and card credit are both neutral; abatement linked once');
SELECT public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000003',
 '{"account_id":"bank-a","external_id":"transfer-out","revision":1,"kind":"own_transfer","reason":"Verified both owned accounts","other_account_id":"bank-b","other_external_id":"transfer-in","other_revision":1}');
SELECT public.test_assert((SELECT count(*)=2 FROM public.of_reconciliations WHERE kind='own_transfer'),'own transfer has two neutral legs');
SELECT public.of_auto_review('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'));
SELECT public.test_assert((SELECT kind='expense' FROM public.of_reconciliations WHERE external_id='purchase') AND
    NOT EXISTS(SELECT 1 FROM public.of_reconciliations WHERE external_id='uncertain'),'only proven card purchase auto books; uncertain transfer stays pending');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.of_reconciliations WHERE external_id='older-salary'),
 'future category rule does not retroactively classify existing unresolved records');
SELECT public.of_stage_page('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),'bank-a',
 '[{"external_id":"new-salary","bank_status":"POSTED","amount":100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT","metadata":{"category_id":"salary-category"}}]',NULL);
SELECT public.of_auto_review('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'));
SELECT public.test_assert((SELECT kind='income' FROM public.of_reconciliations WHERE external_id='new-salary'),
 'approved category rule classifies newly imported records');
DO $$ BEGIN
 BEGIN PERFORM public.of_decide('22222222-2222-2222-2222-222222222222','sandbox',gen_random_uuid(),
  '{"account_id":"bank-a","external_id":"salary","revision":1,"kind":"income","reason":"Cross owner attack"}');
  RAISE EXCEPTION 'Cross owner unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Cross owner unexpectedly accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.of_decide('11111111-1111-1111-1111-111111111111','production',gen_random_uuid(),
  '{"account_id":"bank-a","external_id":"salary","revision":1,"kind":"income","reason":"Cross environment attack"}');
  RAISE EXCEPTION 'Cross scope unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Cross scope unexpectedly accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.of_decide('11111111-1111-1111-1111-111111111111','sandbox',gen_random_uuid(),
  '{"account_id":"bank-a","external_id":"pending","revision":1,"kind":"expense","reason":"Pending data cannot book"}');
  RAISE EXCEPTION 'Pending unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Pending unexpectedly accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.of_decide('11111111-1111-1111-1111-111111111111','sandbox',gen_random_uuid(),
  '{"account_id":"bank-a","external_id":"salary","kind":"income","reason":"Missing optimistic revision"}');
  RAISE EXCEPTION 'Missing revision unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Missing revision unexpectedly accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000001',
  '{"account_id":"bank-a","external_id":"salary","revision":1,"kind":"pending","reason":"Reused request with a changed body"}');
  RAISE EXCEPTION 'Changed request unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Changed request unexpectedly accepted' THEN RAISE; END IF; END;
END $$;
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.of_reconciliations WHERE owner_id<>'11111111-1111-1111-1111-111111111111')
 AND NOT EXISTS(SELECT 1 FROM public.of_reconciliations WHERE data_scope='production'),'owner/scope and pending attacks do not write decisions');
SELECT public.of_stage_page('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),'bank-a',
 '[{"external_id":"salary","bank_status":"POSTED","amount":1100,"currency":"BRL","occurred_at":"2025-01-01T12:00:00Z","direction":"CREDIT","metadata":{"category_id":"salary-category"}}]',NULL);
SELECT public.test_assert((SELECT revision=2 FROM public.open_finance_transactions WHERE external_id='salary') AND
 (SELECT bank_revision=1 FROM public.of_reconciliations WHERE external_id='salary'),'bank changes invalidate old financial decision');
SELECT public.test_assert(jsonb_array_length(public.of_review_data('11111111-1111-1111-1111-111111111111','production')->'transactions')=0,
 'production dashboard contains no sandbox transactions');
SELECT public.test_assert(public.of_rate_limit('synthetic-bucket',1) AND NOT public.of_rate_limit('synthetic-bucket',1),
 'distributed rate limiter enforces threshold atomically');
SELECT public.of_decide('11111111-1111-1111-1111-111111111111','sandbox','10000000-0000-0000-0000-000000000004',
 '{"account_id":"bank-a","external_id":"transfer-out","revision":1,"kind":"pending","reason":"Reopen transfer for review"}');
SELECT public.test_assert((SELECT count(*)=2 FROM public.of_reconciliations WHERE external_id IN ('transfer-in','transfer-out') AND kind='pending'),
 'reopening a pair reopens both legs atomically');
SELECT public.of_enqueue_event_v3('release-deleted','release-item','card-a','["purchase"]');
SELECT public.test_assert((SELECT count(*)=1 FROM public.of_pending_deletions('release-item',
 (SELECT lease FROM public.of_items WHERE id='release-item'))),'deletion webhook enqueues verification without altering bank values');
SELECT public.of_resolve_deletion('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),
 'release-deleted','card-a','purchase',true);
SELECT public.test_assert((SELECT bank_status='UNKNOWN' AND revision=2 FROM public.open_finance_transactions WHERE external_id='purchase')
 AND (SELECT bank_revision=1 FROM public.of_reconciliations WHERE external_id='purchase'),
 'verified provider absence invalidates decision and preserves the original transaction');
SELECT public.of_resolve_deletion('release-item',(SELECT lease FROM public.of_items WHERE id='release-item'),
 'release-deleted','card-a','purchase',true);
SELECT public.test_assert((SELECT count(*)=1 FROM public.of_audit WHERE action->>'kind'='provider_transaction_unavailable'),
 'deletion verification retries are audit-idempotent');
RESET ROLE;
SELECT public.test_assert((SELECT count(*)=2 AND sum(amount)=70 FROM public.transactions) AND
 (SELECT count(*)=1 AND sum(amount)=30 FROM public.abatimentos),'release preserves all historical ledger sentinels');
DROP FUNCTION public.test_assert(boolean,text);
