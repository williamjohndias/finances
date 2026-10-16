-- REVIEW ONLY. Apply after 001/002 in homologation. No legacy ledger writes.
BEGIN;
ALTER TABLE public.of_items ADD COLUMN data_scope text NOT NULL DEFAULT 'unknown'
    CHECK (data_scope IN ('unknown','sandbox','production'));
ALTER TABLE public.open_finance_transactions ADD COLUMN revision bigint NOT NULL DEFAULT 1;
ALTER TABLE public.of_consents DROP CONSTRAINT of_consents_client_user_id_key;
CREATE TABLE public.of_user_bindings(
    owner_id uuid NOT NULL REFERENCES auth.users(id),data_scope text NOT NULL CHECK(data_scope IN ('sandbox','production')),
    client_user_id text NOT NULL UNIQUE,PRIMARY KEY(owner_id,data_scope)
);
CREATE FUNCTION public.of_new_consent(p_owner uuid,p_scope text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE binding text; c public.of_consents;
BEGIN
    IF p_scope NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Scope rejected'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,1));
    SELECT client_user_id INTO binding FROM public.of_user_bindings WHERE owner_id=p_owner AND data_scope=p_scope;
    IF NOT FOUND THEN
        INSERT INTO public.of_user_bindings VALUES(p_owner,p_scope,gen_random_uuid()::text) RETURNING client_user_id INTO binding;
    END IF;
    INSERT INTO public.of_consents(owner_id,client_user_id,expires_at) VALUES(p_owner,binding,now()+interval '30 days') RETURNING * INTO c;
    RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.of_bank_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
    IF TG_OP='UPDATE' THEN
        NEW.revision := OLD.revision;
        IF ROW(OLD.amount,OLD.currency,OLD.occurred_at,OLD.direction,OLD.bank_status,OLD.payload->'metadata')
           IS DISTINCT FROM ROW(NEW.amount,NEW.currency,NEW.occurred_at,NEW.direction,NEW.bank_status,NEW.payload->'metadata')
        THEN NEW.revision := OLD.revision+1; END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER of_bank_revision BEFORE UPDATE ON public.open_finance_transactions
    FOR EACH ROW EXECUTE FUNCTION public.of_bank_revision();

CREATE TABLE public.of_rate_limits(bucket text PRIMARY KEY, window_start timestamptz NOT NULL, hits integer NOT NULL);
CREATE FUNCTION public.of_rate_limit(p_bucket text,p_limit integer) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n integer;
BEGIN
    INSERT INTO public.of_rate_limits VALUES(p_bucket,date_trunc('minute',now()),1)
    ON CONFLICT(bucket) DO UPDATE SET
        hits=CASE WHEN public.of_rate_limits.window_start<date_trunc('minute',now()) THEN 1 ELSE public.of_rate_limits.hits+1 END,
        window_start=date_trunc('minute',now()) RETURNING hits INTO n;
    RETURN n<=p_limit;
END $$;

CREATE TABLE public.of_legacy_ownership(
    source text NOT NULL CHECK(source IN ('transactions','abatimentos','recorrencias')),
    legacy_id text NOT NULL, owner_id uuid NOT NULL REFERENCES auth.users(id),
    data_scope text NOT NULL CHECK(data_scope IN ('sandbox','production')),
    snapshot jsonb NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(source,legacy_id), CHECK(snapshot->>'id'=legacy_id)
);
-- Immutable, append-only audit. No UPDATE/DELETE grants, even for backend.
CREATE TABLE public.of_audit(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id),
    data_scope text NOT NULL CHECK(data_scope IN ('sandbox','production')),
    request_id uuid NOT NULL, action jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_id,request_id)
);
CREATE TABLE public.of_reconciliations(
    provider text NOT NULL DEFAULT 'pluggy' CHECK(provider='pluggy'),
    account_id text NOT NULL,external_id text NOT NULL,owner_id uuid NOT NULL REFERENCES auth.users(id),
    data_scope text NOT NULL CHECK(data_scope IN ('sandbox','production')),
    bank_revision bigint NOT NULL, kind text NOT NULL CHECK(kind IN
        ('income','expense','refund','invoice_payment','own_transfer','duplicate','pending')),
    decision_id uuid NOT NULL REFERENCES public.of_audit(id),
    other_account_id text,other_external_id text,other_revision bigint,
    legacy_table text,legacy_id text,legacy_occurrence date,
    PRIMARY KEY(account_id,external_id),
    FOREIGN KEY(provider,account_id,external_id) REFERENCES public.open_finance_transactions(provider,account_id,external_id),
    FOREIGN KEY(legacy_table,legacy_id) REFERENCES public.of_legacy_ownership(source,legacy_id)
);
CREATE UNIQUE INDEX of_one_history_match ON public.of_reconciliations(owner_id,data_scope,legacy_table,legacy_id,
    COALESCE(legacy_occurrence,DATE '0001-01-01')) WHERE legacy_id IS NOT NULL;
CREATE TABLE public.of_rules(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id),
    data_scope text NOT NULL CHECK(data_scope IN ('sandbox','production')), account_id text NOT NULL REFERENCES public.of_accounts(id),
    category_id text NOT NULL,direction text NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
    kind text NOT NULL CHECK(kind IN ('income','expense','refund')),active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_by uuid NOT NULL REFERENCES public.of_audit(id), UNIQUE(owner_id,data_scope,account_id,category_id,direction)
);
CREATE TABLE public.of_deletion_checks(
    event_id text NOT NULL REFERENCES public.of_events(event_id),account_id text NOT NULL REFERENCES public.of_accounts(id),
    external_id text NOT NULL,owner_id uuid NOT NULL REFERENCES auth.users(id),processed boolean NOT NULL DEFAULT false,
    PRIMARY KEY(event_id,account_id,external_id)
);
CREATE FUNCTION public.of_enqueue_event_v3(p_event text,p_item text,p_account text,p_deleted jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE owner uuid;
BEGIN
    SELECT i.owner_id INTO owner FROM public.of_items i JOIN public.of_consents c ON c.id=i.consent_id
        WHERE i.id=p_item AND c.revoked_at IS NULL AND c.expires_at>now();
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO public.of_events(event_id,item_id) VALUES(p_event,p_item) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO public.of_deletion_checks(event_id,account_id,external_id,owner_id)
        SELECT p_event,t.account_id,t.external_id,owner FROM public.open_finance_transactions t
        JOIN jsonb_array_elements_text(p_deleted) d ON d.value=t.external_id
        WHERE t.provider='pluggy' AND t.item_id=p_item AND t.account_id=p_account AND t.owner_id=owner ON CONFLICT DO NOTHING;
    UPDATE public.of_items SET sync_requested=true WHERE id=p_item;
END $$;
CREATE FUNCTION public.of_pending_deletions(p_item text,p_lease uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items;
BEGIN
    v:=public.of_active_job(p_item,p_lease);
    RETURN QUERY SELECT jsonb_build_object('event_id',d.event_id,'account_id',d.account_id,'external_id',d.external_id)
        FROM public.of_deletion_checks d JOIN public.of_events e ON e.event_id=d.event_id
        WHERE e.item_id=p_item AND d.owner_id=v.owner_id AND NOT d.processed ORDER BY e.received_at LIMIT 5;
END $$;
CREATE FUNCTION public.of_resolve_deletion(p_item text,p_lease uuid,p_event text,p_account text,p_external text,p_missing boolean)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items;
BEGIN
    v:=public.of_active_job(p_item,p_lease);
    UPDATE public.of_deletion_checks d SET processed=true FROM public.of_events e WHERE d.event_id=p_event AND e.event_id=d.event_id
        AND e.item_id=p_item AND d.owner_id=v.owner_id AND d.account_id=p_account AND d.external_id=p_external AND NOT d.processed;
    IF NOT FOUND THEN RETURN; END IF;
    IF p_missing THEN
        UPDATE public.open_finance_transactions SET bank_status='UNKNOWN'
            WHERE provider='pluggy' AND account_id=p_account AND external_id=p_external AND owner_id=v.owner_id AND item_id=p_item;
        INSERT INTO public.of_audit(owner_id,data_scope,request_id,action) VALUES(v.owner_id,v.data_scope,gen_random_uuid(),
            jsonb_build_object('kind','provider_transaction_unavailable','account_id',p_account,'external_id',p_external));
    END IF;
END $$;

CREATE FUNCTION public.of_verify_scope(p_item text,p_lease uuid,p_scope text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items;
BEGIN
    v:=public.of_active_job(p_item,p_lease);
    IF p_scope NOT IN ('sandbox','production') OR v.data_scope NOT IN ('unknown',p_scope)
        THEN RAISE EXCEPTION 'Scope rejected'; END IF;
    UPDATE public.of_items SET data_scope=p_scope WHERE id=p_item;
END $$;

CREATE FUNCTION public.of_claim_sync_v3(p_scope text) RETURNS SETOF jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items; binding text;
BEGIN
    IF p_scope NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Scope rejected'; END IF;
    SELECT i.* INTO v FROM public.of_items i JOIN public.of_consents c ON c.id=i.consent_id
    WHERE i.data_scope IN ('unknown',p_scope) AND c.revoked_at IS NULL AND c.expires_at>now()
      AND i.next_attempt_at<=now() AND (i.lease_until IS NULL OR i.lease_until<now())
      AND (i.sync_requested OR i.last_synced_at IS NULL OR i.last_synced_at<now()-interval '1 day')
    ORDER BY i.last_synced_at NULLS FIRST,i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE public.of_items SET lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',
        status='syncing',sync_requested=false WHERE id=v.id RETURNING * INTO v;
    SELECT client_user_id INTO binding FROM public.of_consents WHERE id=v.consent_id;
    RETURN NEXT jsonb_build_object('id',v.id,'lease',v.lease,'owner_id',v.owner_id,'client_user_id',binding,'data_scope',v.data_scope);
END $$;

CREATE FUNCTION public.of_bind_item_v3(p_owner uuid,p_consent uuid,p_item text,p_binding text,p_connector text,p_scope text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
    IF p_scope NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Scope rejected'; END IF;
    PERFORM 1 FROM public.of_consents WHERE id=p_consent AND owner_id=p_owner AND client_user_id=p_binding
        AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consent rejected'; END IF;
    INSERT INTO public.of_items(id,owner_id,consent_id,connector,data_scope) VALUES(p_item,p_owner,p_consent,p_connector,p_scope)
        ON CONFLICT(id) DO NOTHING;
    UPDATE public.of_items SET data_scope=p_scope,consent_id=p_consent,sync_requested=true
        WHERE id=p_item AND owner_id=p_owner AND data_scope IN ('unknown',p_scope);
    IF NOT FOUND THEN RAISE EXCEPTION 'Scope rejected'; END IF;
    INSERT INTO public.of_audit(owner_id,data_scope,request_id,action) VALUES(p_owner,p_scope,gen_random_uuid(),
        jsonb_build_object('kind','consent_binding','item_id',p_item));
END $$;

CREATE FUNCTION public.of_renew_consent(p_owner uuid,p_item text,p_binding text,p_scope text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items;
BEGIN
    SELECT * INTO v FROM public.of_items WHERE id=p_item AND owner_id=p_owner FOR UPDATE;
    IF NOT FOUND OR p_scope NOT IN ('sandbox','production') OR v.data_scope NOT IN ('unknown',p_scope)
        THEN RAISE EXCEPTION 'Item unavailable'; END IF;
    UPDATE public.of_consents SET revoked_at=NULL,expires_at=now()+interval '30 days'
        WHERE id=v.consent_id AND owner_id=p_owner AND client_user_id=p_binding;
    IF NOT FOUND THEN RAISE EXCEPTION 'Binding rejected'; END IF;
    UPDATE public.of_items SET data_scope=p_scope,sync_requested=true WHERE id=p_item;
    INSERT INTO public.of_audit(owner_id,data_scope,request_id,action) VALUES(p_owner,p_scope,gen_random_uuid(),
        jsonb_build_object('kind','consent_renewal','item_id',p_item));
END $$;

CREATE FUNCTION public.of_disable_rule(p_owner uuid,p_scope text,p_rule uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
    UPDATE public.of_rules SET active=false WHERE id=p_rule AND owner_id=p_owner AND data_scope=p_scope;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rule unavailable'; END IF;
    INSERT INTO public.of_audit(owner_id,data_scope,request_id,action) VALUES(p_owner,p_scope,gen_random_uuid(),
        jsonb_build_object('kind','rule_disabled','rule_id',p_rule));
END $$;

CREATE FUNCTION public.of_decide(p_owner uuid,p_scope text,p_request uuid,p_action jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.open_finance_transactions; o public.open_finance_transactions;
    old public.of_reconciliations; k text:=p_action->>'kind'; a_kind text; o_kind text;
    aid uuid; prior public.of_audit; hist public.of_legacy_ownership; occurrence date;
BEGIN
    -- Serializes decisions per owner, including two-leg transfers and retries.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
    SELECT * INTO prior FROM public.of_audit WHERE owner_id=p_owner AND request_id=p_request;
    IF FOUND THEN
        IF prior.action<>p_action OR prior.data_scope<>p_scope THEN RAISE EXCEPTION 'Request conflict'; END IF;
        RETURN prior.id;
    END IF;
    SELECT t.* INTO b FROM public.open_finance_transactions t
        JOIN public.of_accounts a ON a.id=t.account_id JOIN public.of_items i ON i.id=a.item_id
        WHERE t.provider='pluggy' AND t.account_id=p_action->>'account_id' AND t.external_id=p_action->>'external_id'
        AND t.owner_id=p_owner AND i.data_scope=p_scope FOR UPDATE OF t;
    -- Account kind is queried separately to preserve the composite bank row type.
    IF NOT FOUND THEN RAISE EXCEPTION 'Transaction unavailable'; END IF;
    SELECT kind INTO a_kind FROM public.of_accounts WHERE id=b.account_id;
    IF b.revision IS DISTINCT FROM (p_action->>'revision')::bigint OR b.amount IS NULL OR b.occurred_at IS NULL
        OR b.currency IS NULL THEN RAISE EXCEPTION 'Bank revision changed'; END IF;
    IF k NOT IN ('income','expense','refund','invoice_payment','own_transfer','duplicate','pending')
        OR length(COALESCE(p_action->>'reason',''))<8 OR length(p_action->>'reason')>300
        THEN RAISE EXCEPTION 'Decision rejected'; END IF;
    IF k<>'pending' AND (b.bank_status<>'POSTED' OR (b.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date>
        (now() AT TIME ZONE 'America/Sao_Paulo')::date) THEN RAISE EXCEPTION 'Not realized'; END IF;
    IF k='income' AND (b.direction<>'CREDIT' OR a_kind<>'BANK') THEN RAISE EXCEPTION 'Income direction rejected'; END IF;
    IF k='expense' AND b.direction<>'DEBIT' THEN RAISE EXCEPTION 'Expense direction rejected'; END IF;
    IF k='refund' AND (b.direction<>'CREDIT' OR a_kind<>'CREDIT') THEN RAISE EXCEPTION 'Refund rejected'; END IF;
    IF k='invoice_payment' AND NOT ((a_kind='BANK' AND b.direction='DEBIT') OR (a_kind='CREDIT' AND b.direction='CREDIT'))
        THEN RAISE EXCEPTION 'Payment direction rejected'; END IF;
    SELECT * INTO old FROM public.of_reconciliations WHERE account_id=b.account_id AND external_id=b.external_id;
    IF p_action->>'other_account_id' IS NOT NULL THEN
        SELECT t.* INTO o FROM public.open_finance_transactions t JOIN public.of_accounts a ON a.id=t.account_id
            JOIN public.of_items i ON i.id=a.item_id WHERE t.provider='pluggy' AND t.owner_id=p_owner
            AND i.data_scope=p_scope AND t.account_id=p_action->>'other_account_id' AND t.external_id=p_action->>'other_external_id'
            FOR UPDATE OF t;
        IF NOT FOUND OR (o.account_id=b.account_id AND o.external_id=b.external_id) OR o.bank_status<>'POSTED'
            OR o.revision IS DISTINCT FROM (p_action->>'other_revision')::bigint OR abs(o.amount)<>abs(b.amount) OR o.currency<>b.currency
            OR (o.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date
            THEN RAISE EXCEPTION 'Counterpart rejected'; END IF;
        SELECT kind INTO o_kind FROM public.of_accounts WHERE id=o.account_id;
        IF k='own_transfer' AND (a_kind<>'BANK' OR o_kind<>'BANK' OR b.account_id=o.account_id OR b.direction=o.direction)
            THEN RAISE EXCEPTION 'Transfer rejected'; END IF;
        IF k='invoice_payment' AND NOT(a_kind='BANK' AND b.direction='DEBIT' AND o_kind='CREDIT' AND o.direction='CREDIT')
            THEN RAISE EXCEPTION 'Invoice pair rejected'; END IF;
        IF k='duplicate' AND (b.direction<>o.direction OR EXISTS(SELECT 1 FROM public.of_reconciliations
            WHERE account_id=o.account_id AND external_id=o.external_id AND kind='duplicate'))
            THEN RAISE EXCEPTION 'Duplicate cycle rejected'; END IF;
        IF k NOT IN ('own_transfer','invoice_payment','duplicate') THEN RAISE EXCEPTION 'Unexpected counterpart'; END IF;
        IF k<>'duplicate' AND EXISTS(SELECT 1 FROM public.of_reconciliations WHERE account_id=o.account_id AND external_id=o.external_id
            AND kind<>'pending' AND ROW(other_account_id,other_external_id) IS DISTINCT FROM ROW(b.account_id,b.external_id))
            THEN RAISE EXCEPTION 'Counterpart already reconciled'; END IF;
    ELSIF k='own_transfer' AND b.payload->'metadata'->>'semantic_hint' IS DISTINCT FROM 'own_transfer' THEN
        RAISE EXCEPTION 'Transfer needs counterpart';
    ELSIF k='duplicate' THEN RAISE EXCEPTION 'Duplicate needs canonical transaction'; END IF;
    IF EXISTS(SELECT 1 FROM public.of_reconciliations WHERE other_account_id=b.account_id AND other_external_id=b.external_id
        AND kind='duplicate') AND k='duplicate' THEN RAISE EXCEPTION 'Duplicate cycle rejected'; END IF;
    IF p_action->>'legacy_id' IS NOT NULL THEN
        SELECT * INTO hist FROM public.of_legacy_ownership WHERE source=p_action->>'legacy_table'
            AND legacy_id=p_action->>'legacy_id' AND owner_id=p_owner AND data_scope=p_scope;
        IF NOT FOUND OR b.currency<>'BRL' OR hist.snapshot->>'valor' IS NULL OR abs((hist.snapshot->>'valor')::numeric)<>abs(b.amount)
            THEN RAISE EXCEPTION 'Historical match rejected'; END IF;
        IF hist.source='abatimentos' AND k<>'invoice_payment' THEN RAISE EXCEPTION 'Payment must be neutral'; END IF;
        IF hist.source<>'abatimentos' AND k<>(CASE WHEN hist.snapshot->>'tipo'='receita' THEN 'income' ELSE 'expense' END)
            THEN RAISE EXCEPTION 'Historical classification rejected'; END IF;
        IF hist.source='recorrencias' THEN
            occurrence:=(p_action->>'legacy_occurrence')::date;
            IF occurrence IS NULL OR occurrence<(hist.snapshot->>'data_inicio')::date OR
                extract(day FROM occurrence)<>least((hist.snapshot->>'dia_mes')::int,
                    extract(day FROM date_trunc('month',occurrence)+interval '1 month - 1 day')::int)
                THEN RAISE EXCEPTION 'Occurrence rejected'; END IF;
        END IF;
    END IF;
    IF k='invoice_payment' AND o.account_id IS NULL AND hist.source IS DISTINCT FROM 'abatimentos'
        THEN RAISE EXCEPTION 'Payment needs invoice counterpart or historical payment'; END IF;
    IF old.other_account_id IS NOT NULL AND old.kind<>'duplicate' AND
        (k<>'pending' AND ROW(old.other_account_id,old.other_external_id) IS DISTINCT FROM ROW(o.account_id,o.external_id))
        THEN RAISE EXCEPTION 'Reset previous pair first'; END IF;
    INSERT INTO public.of_audit(owner_id,data_scope,request_id,action) VALUES(p_owner,p_scope,p_request,p_action) RETURNING id INTO aid;
    IF k='pending' AND old.other_account_id IS NOT NULL AND old.kind<>'duplicate' THEN
        UPDATE public.of_reconciliations SET kind='pending',decision_id=aid,other_account_id=NULL,other_external_id=NULL,
            other_revision=NULL,legacy_id=NULL,legacy_table=NULL,legacy_occurrence=NULL
            WHERE account_id=old.other_account_id AND external_id=old.other_external_id AND owner_id=p_owner;
    END IF;
    INSERT INTO public.of_reconciliations(account_id,external_id,owner_id,data_scope,bank_revision,kind,decision_id,
        other_account_id,other_external_id,other_revision,legacy_table,legacy_id,legacy_occurrence)
    VALUES(b.account_id,b.external_id,p_owner,p_scope,b.revision,k,aid,o.account_id,o.external_id,o.revision,
        hist.source,hist.legacy_id,occurrence)
    ON CONFLICT(account_id,external_id) DO UPDATE SET bank_revision=EXCLUDED.bank_revision,kind=EXCLUDED.kind,
        decision_id=EXCLUDED.decision_id,other_account_id=EXCLUDED.other_account_id,other_external_id=EXCLUDED.other_external_id,
        other_revision=EXCLUDED.other_revision,legacy_table=EXCLUDED.legacy_table,legacy_id=EXCLUDED.legacy_id,
        legacy_occurrence=EXCLUDED.legacy_occurrence;
    IF o.account_id IS NOT NULL AND k IN ('own_transfer','invoice_payment') THEN
        INSERT INTO public.of_reconciliations(account_id,external_id,owner_id,data_scope,bank_revision,kind,decision_id,
            other_account_id,other_external_id,other_revision)
        VALUES(o.account_id,o.external_id,p_owner,p_scope,o.revision,k,aid,b.account_id,b.external_id,b.revision)
        ON CONFLICT(account_id,external_id) DO UPDATE SET bank_revision=EXCLUDED.bank_revision,kind=EXCLUDED.kind,
            decision_id=EXCLUDED.decision_id,other_account_id=EXCLUDED.other_account_id,other_external_id=EXCLUDED.other_external_id,
            other_revision=EXCLUDED.other_revision,legacy_table=NULL,legacy_id=NULL,legacy_occurrence=NULL;
    END IF;
    IF COALESCE((p_action->>'save_rule')::boolean,false) THEN
        IF k NOT IN ('income','expense','refund') OR b.payload->'metadata'->>'category_id' IS NULL
            THEN RAISE EXCEPTION 'Rule needs a provider category'; END IF;
        INSERT INTO public.of_rules(owner_id,data_scope,account_id,category_id,direction,kind,approved_by)
        VALUES(p_owner,p_scope,b.account_id,b.payload->'metadata'->>'category_id',b.direction,k,aid)
        ON CONFLICT(owner_id,data_scope,account_id,category_id,direction) DO UPDATE SET kind=EXCLUDED.kind,approved_by=aid,active=true,created_at=now();
    END IF;
    RETURN aid;
END $$;

CREATE FUNCTION public.of_auto_review(p_item text,p_lease uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.of_items; r record; k text;
BEGIN
    v:=public.of_active_job(p_item,p_lease);
    FOR r IN SELECT t.*,a.kind AS account_kind FROM public.open_finance_transactions t
        JOIN public.of_accounts a ON a.id=t.account_id WHERE t.item_id=p_item AND t.owner_id=v.owner_id
        AND t.bank_status='POSTED' AND (t.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date<=
            (now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND NOT EXISTS(SELECT 1 FROM public.of_reconciliations d WHERE d.account_id=t.account_id AND d.external_id=t.external_id)
    LOOP
        k:=NULL;
        IF r.payload->'metadata'->>'semantic_hint'='own_transfer' AND r.account_kind='BANK' THEN k:='own_transfer';
        ELSIF r.payload->'metadata'->>'semantic_hint'='card_purchase' AND r.account_kind='CREDIT' AND r.direction='DEBIT'
            AND EXISTS(SELECT 1 FROM public.of_user_bindings u JOIN public.of_consents c ON c.client_user_id=u.client_user_id
                WHERE u.owner_id=v.owner_id AND u.data_scope=v.data_scope AND c.id=v.consent_id)
            THEN k:='expense';
        ELSE SELECT kind INTO k FROM public.of_rules WHERE owner_id=v.owner_id AND data_scope=v.data_scope
            AND account_id=r.account_id AND category_id=r.payload->'metadata'->>'category_id' AND direction=r.direction AND active
            AND r.first_seen_at>=created_at; END IF;
        IF k IS NOT NULL THEN PERFORM public.of_decide(v.owner_id,v.data_scope,gen_random_uuid(),jsonb_build_object(
            'account_id',r.account_id,'external_id',r.external_id,'revision',r.revision,'kind',k,'reason','Automatic: verified metadata or approved category rule')); END IF;
    END LOOP;
END $$;

CREATE FUNCTION public.of_review_data(p_owner uuid,p_scope text) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
SELECT jsonb_build_object(
 'transactions',COALESCE((SELECT jsonb_agg(jsonb_build_object('account_id',t.account_id,'external_id',t.external_id,
    'amount',t.amount,'currency',t.currency,'occurred_at',t.occurred_at,'direction',t.direction,'bank_status',t.bank_status,
    'revision',t.revision,'account_kind',a.kind,'category_id',t.payload->'metadata'->>'category_id',
    'metadata',COALESCE(t.payload->'metadata','{}'::jsonb),'data_scope',i.data_scope))
    FROM public.open_finance_transactions t JOIN public.of_accounts a ON a.id=t.account_id JOIN public.of_items i ON i.id=a.item_id
    WHERE t.owner_id=p_owner AND i.data_scope=p_scope),'[]'::jsonb),
 'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'currency',a.currency,'balance',a.balance,
    'observed_at',a.observed_at,'data_scope',i.data_scope)) FROM public.of_accounts a JOIN public.of_items i ON i.id=a.item_id
    WHERE a.owner_id=p_owner AND i.data_scope=p_scope),'[]'::jsonb),
 'decisions',COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.of_reconciliations d WHERE d.owner_id=p_owner AND d.data_scope=p_scope),'[]'::jsonb),
 'legacy',COALESCE((SELECT jsonb_agg(l.snapshot||jsonb_build_object('source',l.source)) FROM public.of_legacy_ownership l
    WHERE l.owner_id=p_owner AND l.data_scope=p_scope),'[]'::jsonb),
 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT id,action,created_at FROM public.of_audit
    WHERE owner_id=p_owner AND data_scope=p_scope ORDER BY created_at DESC LIMIT 100) q),'[]'::jsonb),
 'rules',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.of_rules r WHERE r.owner_id=p_owner AND r.data_scope=p_scope AND active),'[]'::jsonb))
$$;

ALTER TABLE public.of_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_legacy_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_user_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_deletion_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.of_rate_limits,public.of_legacy_ownership,public.of_audit,public.of_reconciliations,public.of_rules FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.of_legacy_ownership,public.of_audit TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.of_rate_limits,public.of_reconciliations,public.of_rules TO service_role;
REVOKE ALL ON public.of_user_bindings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.of_user_bindings TO service_role;
REVOKE ALL ON public.of_deletion_checks FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.of_deletion_checks TO service_role;
REVOKE ALL ON FUNCTION public.of_bank_revision(),public.of_rate_limit(text,integer),public.of_verify_scope(text,uuid,text),
 public.of_claim_sync_v3(text),public.of_decide(uuid,text,uuid,jsonb),public.of_auto_review(text,uuid),public.of_review_data(uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.of_bind_item_v3(uuid,uuid,text,text,text,text),public.of_renew_consent(uuid,text,text,text),
 public.of_disable_rule(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.of_bank_revision(),public.of_rate_limit(text,integer),public.of_verify_scope(text,uuid,text),
 public.of_claim_sync_v3(text),public.of_decide(uuid,text,uuid,jsonb),public.of_auto_review(text,uuid),public.of_review_data(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.of_bind_item_v3(uuid,uuid,text,text,text,text),public.of_renew_consent(uuid,text,text,text),
 public.of_disable_rule(uuid,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.of_new_consent(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.of_new_consent(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.of_enqueue_event_v3(text,text,text,jsonb),public.of_pending_deletions(text,uuid),
 public.of_resolve_deletion(text,uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.of_enqueue_event_v3(text,text,text,jsonb),public.of_pending_deletions(text,uuid),
 public.of_resolve_deletion(text,uuid,text,text,text,boolean) TO service_role;
COMMIT;
