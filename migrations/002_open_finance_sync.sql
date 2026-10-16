-- REVIEW ONLY: apply 001 then 002 in an isolated homologation database first.
-- No legacy table is modified. Existing unowned staging rows remain quarantined.
BEGIN;
CREATE TABLE public.of_consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id),
    client_user_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    UNIQUE (id, owner_id), CHECK (expires_at > created_at)
);
CREATE TABLE public.of_items (
    id text PRIMARY KEY,
    owner_id uuid NOT NULL,
    consent_id uuid NOT NULL UNIQUE,
    connector text NOT NULL,
    provider_status text NOT NULL DEFAULT 'UNKNOWN',
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','syncing','synced','error')),
    sync_requested boolean NOT NULL DEFAULT true,
    lease uuid,
    lease_until timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_synced_at timestamptz,
    error_code text CHECK (error_code IS NULL OR error_code = 'provider_unavailable'),
    UNIQUE (id, owner_id),
    FOREIGN KEY (consent_id, owner_id) REFERENCES public.of_consents(id, owner_id)
);
CREATE TABLE public.of_accounts (
    id text PRIMARY KEY,
    item_id text NOT NULL,
    owner_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('BANK','CREDIT')),
    currency text NOT NULL CHECK (length(currency) = 3),
    balance numeric NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    cursor text,
    last_synced_at timestamptz,
    UNIQUE (id, owner_id, item_id),
    FOREIGN KEY (item_id, owner_id) REFERENCES public.of_items(id, owner_id)
);
ALTER TABLE public.open_finance_transactions
    ADD COLUMN owner_id uuid REFERENCES auth.users(id),
    ADD COLUMN amount numeric,
    ADD COLUMN currency text,
    ADD COLUMN occurred_at timestamptz,
    ADD COLUMN direction text CHECK (direction IN ('CREDIT','DEBIT')),
    ADD COLUMN observed_at timestamptz NOT NULL DEFAULT now(),
    ADD CONSTRAINT of_transaction_account_fk FOREIGN KEY (account_id, owner_id, item_id)
        REFERENCES public.of_accounts(id, owner_id, item_id);
CREATE INDEX of_transactions_owner ON public.open_finance_transactions(owner_id, first_seen_at DESC);
CREATE TABLE public.of_events (
    event_id text PRIMARY KEY,
    item_id text NOT NULL REFERENCES public.of_items(id),
    received_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only data access. UI uses verified Auth identities and backend filtering;
-- even authenticated clients cannot read staging directly via PostgREST.
ALTER TABLE public.of_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.of_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.of_consents, public.of_items, public.of_accounts,
    public.of_events, public.open_finance_transactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.of_consents, public.of_items, public.of_accounts,
    public.of_events, public.open_finance_transactions TO service_role;

CREATE FUNCTION public.of_bind_item(p_owner uuid, p_consent uuid, p_item text,
    p_binding text, p_connector text) RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    PERFORM 1 FROM public.of_consents WHERE id=p_consent AND owner_id=p_owner
        AND client_user_id=p_binding AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consent unavailable'; END IF;
    INSERT INTO public.of_items(id,owner_id,consent_id,connector)
        VALUES(p_item,p_owner,p_consent,p_connector)
        ON CONFLICT(id) DO NOTHING;
    PERFORM 1 FROM public.of_items WHERE id=p_item AND owner_id=p_owner AND consent_id=p_consent;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ownership rejected'; END IF;
END $$;

CREATE FUNCTION public.of_claim_sync() RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.of_items; v_binding text;
BEGIN
    SELECT i.* INTO v FROM public.of_items i JOIN public.of_consents c ON c.id=i.consent_id
        WHERE c.revoked_at IS NULL AND c.expires_at>now() AND i.next_attempt_at<=now()
        AND (i.lease_until IS NULL OR i.lease_until<now())
        AND (i.sync_requested OR i.last_synced_at IS NULL OR i.last_synced_at<now()-interval '1 day')
        ORDER BY i.last_synced_at NULLS FIRST, i.id FOR UPDATE OF i SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE public.of_items SET lease=gen_random_uuid(), lease_until=now()+interval '2 minutes',
        status='syncing', sync_requested=false WHERE id=v.id RETURNING * INTO v;
    SELECT client_user_id INTO v_binding FROM public.of_consents WHERE id=v.consent_id;
    RETURN NEXT jsonb_build_object('id',v.id,'lease',v.lease,'owner_id',v.owner_id,'client_user_id',v_binding);
END $$;

-- Called inside each staging transaction. Locks serialize revocation and writes;
-- an expired worker cannot overwrite a new worker's checkpoints.
CREATE FUNCTION public.of_active_job(p_item text, p_lease uuid) RETURNS public.of_items
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.of_items;
BEGIN
    SELECT * INTO v FROM public.of_items WHERE id=p_item AND lease=p_lease
        AND lease_until>now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable'; END IF;
    PERFORM 1 FROM public.of_consents WHERE id=v.consent_id AND owner_id=v.owner_id
        AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consent unavailable'; END IF;
    RETURN v;
END $$;

CREATE FUNCTION public.of_stage_account(p_item text, p_lease uuid, p_account jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.of_items; a public.of_accounts;
BEGIN
    v := public.of_active_job(p_item,p_lease);
    INSERT INTO public.of_accounts(id,item_id,owner_id,kind,currency,balance)
        VALUES(p_account->>'id',p_item,v.owner_id,p_account->>'kind',p_account->>'currency',
            (p_account->>'balance')::numeric)
        ON CONFLICT(id) DO UPDATE SET balance=EXCLUDED.balance,kind=EXCLUDED.kind,
            currency=EXCLUDED.currency,observed_at=now()
        WHERE public.of_accounts.item_id=p_item AND public.of_accounts.owner_id=v.owner_id
        RETURNING * INTO a;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account ownership rejected'; END IF;
    RETURN jsonb_build_object('cursor',a.cursor,'last_synced_at',a.last_synced_at);
END $$;

CREATE FUNCTION public.of_item_status(p_item text,p_lease uuid,p_status text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    PERFORM public.of_active_job(p_item,p_lease);
    UPDATE public.of_items SET provider_status=p_status WHERE id=p_item;
END $$;

CREATE FUNCTION public.of_stage_page(p_item text,p_lease uuid,p_account text,p_rows jsonb,p_cursor text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v public.of_items;
BEGIN
    v := public.of_active_job(p_item,p_lease);
    PERFORM 1 FROM public.of_accounts WHERE id=p_account AND item_id=p_item AND owner_id=v.owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account ownership rejected'; END IF;
    IF EXISTS (SELECT 1 FROM public.open_finance_transactions t
        JOIN jsonb_array_elements(p_rows) r ON r->>'external_id'=t.external_id
        WHERE t.provider='pluggy' AND t.account_id=p_account
        AND (t.owner_id IS DISTINCT FROM v.owner_id OR t.item_id<>p_item)) THEN
        RAISE EXCEPTION 'Unowned staging conflict requires review';
    END IF;
    INSERT INTO public.open_finance_transactions(provider,item_id,account_id,external_id,owner_id,
        bank_status,payload,amount,currency,occurred_at,direction)
        SELECT 'pluggy',p_item,p_account,r->>'external_id',v.owner_id,r->>'bank_status',r,
            (r->>'amount')::numeric,r->>'currency',(r->>'occurred_at')::timestamptz,r->>'direction'
        FROM jsonb_array_elements(p_rows) r
        ON CONFLICT(provider,account_id,external_id) DO UPDATE SET
            bank_status=EXCLUDED.bank_status,payload=EXCLUDED.payload,amount=EXCLUDED.amount,
            currency=EXCLUDED.currency,occurred_at=EXCLUDED.occurred_at,direction=EXCLUDED.direction,
            observed_at=now()
        WHERE public.open_finance_transactions.owner_id=v.owner_id
            AND public.open_finance_transactions.item_id=p_item;
    -- The data and checkpoint commit together. No legacy records are updated.
    UPDATE public.of_accounts SET cursor=p_cursor,
        last_synced_at=CASE WHEN p_cursor IS NULL THEN now() ELSE last_synced_at END
        WHERE id=p_account AND item_id=p_item AND owner_id=v.owner_id;
END $$;

CREATE FUNCTION public.of_finish_sync(p_item text,p_lease uuid,p_complete boolean,p_failed boolean)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.of_items SET lease=NULL,lease_until=NULL,
        status=CASE WHEN p_failed THEN 'error' WHEN p_complete THEN 'synced' ELSE 'queued' END,
        sync_requested=sync_requested OR NOT p_complete,
        error_code=CASE WHEN p_failed THEN 'provider_unavailable' ELSE NULL END,
        next_attempt_at=now()+CASE WHEN p_failed THEN interval '5 minutes' ELSE interval '0 seconds' END,
        last_synced_at=CASE WHEN p_complete THEN now() ELSE last_synced_at END
        WHERE id=p_item AND lease=p_lease;
END $$;

CREATE FUNCTION public.of_enqueue_event(p_event text,p_item text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    -- Unknown/revoked items are ignored, never adopted from webhook input.
    PERFORM 1 FROM public.of_items i JOIN public.of_consents c ON c.id=i.consent_id
        WHERE i.id=p_item AND c.revoked_at IS NULL AND c.expires_at>now();
    IF NOT FOUND THEN RETURN; END IF;
    INSERT INTO public.of_events(event_id,item_id) VALUES(p_event,p_item) ON CONFLICT DO NOTHING;
    IF FOUND THEN UPDATE public.of_items SET sync_requested=true WHERE id=p_item; END IF;
END $$;

REVOKE ALL ON FUNCTION public.of_bind_item(uuid,uuid,text,text,text),public.of_claim_sync(),
    public.of_active_job(text,uuid),public.of_stage_account(text,uuid,jsonb),
    public.of_stage_page(text,uuid,text,jsonb,text),public.of_finish_sync(text,uuid,boolean,boolean),
    public.of_enqueue_event(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.of_item_status(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.of_bind_item(uuid,uuid,text,text,text),public.of_claim_sync(),
    public.of_active_job(text,uuid),public.of_stage_account(text,uuid,jsonb),
    public.of_stage_page(text,uuid,text,jsonb,text),public.of_finish_sync(text,uuid,boolean,boolean),
    public.of_enqueue_event(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.of_item_status(text,uuid,text) TO service_role;
COMMIT;
