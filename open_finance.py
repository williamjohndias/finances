"""User-scoped Open Finance staging. No writes to the legacy financial ledger."""
import base64
import hashlib
import hmac
import json
import math
import os
import time
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, render_template, request

from pluggy_integration import PluggyClient, PluggyError
from financial_dashboard import build_dashboard


def data_scope():
    scope = os.getenv('OPEN_FINANCE_MODE', 'sandbox')
    if scope not in ('sandbox', 'production'):
        raise FinanceError(503, 'Invalid Open Finance mode')
    return scope


def item_scope(item):
    sandbox = item.get('connector', {}).get('isSandbox')
    if type(sandbox) is not bool:
        raise PluggyError('Pluggy environment unavailable')
    scope = 'sandbox' if sandbox else 'production'
    if scope != data_scope():
        raise PluggyError('Pluggy environment mismatch')
    return scope


class FinanceError(Exception):
    def __init__(self, status=503, message='Open Finance unavailable'):
        self.status = status
        self.message = message


def key_kind(key):
    """Metadata classification only; database grants remain authoritative."""
    if not key:
        return 'missing'
    if key.startswith('sb_secret_'):
        return 'secret'
    if key.startswith('sb_publishable_'):
        return 'publishable'
    try:
        payload = key.split('.')[1]
        role = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role')
        return role if role in ('anon', 'service_role') else 'unknown'
    except (ValueError, IndexError, UnicodeError, AttributeError):
        return 'unknown'


def identifier(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 255 or any(c not in
            'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in value):
        raise FinanceError(400, 'Invalid identifier')
    return value


class SupabaseStore:
    def __init__(self, db):
        self.db = db

    def new_consent(self, owner):
        # A stable opaque binding per owner/environment makes Pluggy's
        # avoidDuplicates effective across new connection attempts.
        return self.db.rpc('of_new_consent', {'p_owner':owner,'p_scope':data_scope()}).execute().data

    def consent(self, owner, consent_id):
        rows = self.db.table('of_consents').select('*').eq('owner_id', owner).eq(
            'id', consent_id).is_('revoked_at', 'null').gt(
            'expires_at', datetime.now(timezone.utc).isoformat()).execute().data
        if not rows:
            raise FinanceError(404, 'Consent unavailable')
        return rows[0]

    def bind(self, owner, consent_id, item, scope):
        return self.db.rpc('of_bind_item_v3', {'p_owner': owner, 'p_consent': consent_id, 'p_scope': scope,
            'p_item': item['id'], 'p_binding': item['clientUserId'],
            'p_connector': str(item.get('connector', {}).get('name', 'Pluggy'))[:120]}).execute().data

    def registered_item(self, owner, item_id):
        rows = self.db.table('of_items').select('id,consent_id,data_scope').eq('owner_id', owner).eq('id', item_id).execute().data
        if not rows:
            raise FinanceError(404, 'Item unavailable')
        consent = self.db.table('of_consents').select('client_user_id,id').eq('owner_id', owner).eq(
            'id', rows[0]['consent_id']).execute().data
        if not consent:
            raise FinanceError(404, 'Consent unavailable')
        return consent[0]

    def renew(self, owner, item_id, binding, scope):
        self.db.rpc('of_renew_consent', {'p_owner': owner, 'p_item': item_id, 'p_binding': binding, 'p_scope': scope}).execute()

    def rate_limit(self, bucket, limit):
        return self.db.rpc('of_rate_limit', {'p_bucket': bucket, 'p_limit': limit}).execute().data

    def review_data(self, owner):
        return self.db.rpc('of_review_data', {'p_owner': owner, 'p_scope': data_scope()}).execute().data

    def decide(self, owner, request_id, action):
        from postgrest.exceptions import APIError
        try:
            return self.db.rpc('of_decide', {'p_owner': owner, 'p_scope': data_scope(),
                'p_request': request_id, 'p_action': action}).execute().data
        except APIError as error:
            if error.code in ('P0001','23505','23503','23514','22P02'):
                raise FinanceError(409, 'Decision conflicts with current bank data; refresh and review') from None
            raise

    def disable_rule(self, owner, rule_id):
        self.db.rpc('of_disable_rule', {'p_owner': owner, 'p_scope': data_scope(), 'p_rule': rule_id}).execute()

    def revoke(self, owner, consent_id):
        self.db.table('of_consents').update({'revoked_at': datetime.now(timezone.utc).isoformat()}).eq(
            'owner_id', owner).eq('id', consent_id).execute()

    def inventory(self, owner):
        # Whitelists: never serialize provider payloads, tokens or personal IDs.
        items = self.db.table('of_items').select(
            'id,consent_id,connector,status,provider_status,last_synced_at,error_code,data_scope').eq('owner_id', owner).in_(
                'data_scope',['unknown',data_scope()]).execute().data
        consents = self.db.table('of_consents').select('id,expires_at,revoked_at').eq('owner_id', owner).execute().data
        # Bank financial data is delivered exclusively by the scope-filtered
        # dashboard RPC. This endpoint is connection/consent inventory only.
        accounts = []
        transactions = []
        return dict(items=items, consents=consents, accounts=accounts, transactions=transactions,
                    source='Pluggy / Open Finance', included_in_dashboard=False)

    def enqueue(self, owner):
        self.db.table('of_items').update({'sync_requested': True}).eq('owner_id', owner).execute()

    def webhook(self, event_id, item_id, account_id=None, deleted_ids=None):
        return self.db.rpc('of_enqueue_event_v3', {'p_event': event_id, 'p_item': item_id,
            'p_account':account_id, 'p_deleted':deleted_ids or []}).execute().data

    def deletions(self, job):
        return self.db.rpc('of_pending_deletions', {'p_item':job['id'],'p_lease':job['lease']}).execute().data

    def resolve_deletion(self, job, check, missing):
        self.db.rpc('of_resolve_deletion',{'p_item':job['id'],'p_lease':job['lease'],
            'p_event':check['event_id'],'p_account':check['account_id'],'p_external':check['external_id'],'p_missing':missing}).execute()

    def claim(self):
        rows = self.db.rpc('of_claim_sync_v3', {'p_scope': data_scope()}).execute().data
        return rows[0] if rows else None

    def account(self, job, account):
        return self.db.rpc('of_stage_account', {'p_item': job['id'], 'p_lease': job['lease'],
            'p_account': account}).execute().data

    def item_status(self, job, status):
        self.db.rpc('of_item_status', {'p_item': job['id'], 'p_lease': job['lease'],
                                     'p_status': status}).execute()

    def verify_scope(self, job, scope):
        self.db.rpc('of_verify_scope', {'p_item': job['id'], 'p_lease': job['lease'], 'p_scope': scope}).execute()

    def auto_review(self, job):
        self.db.rpc('of_auto_review', {'p_item': job['id'], 'p_lease': job['lease']}).execute()

    def page(self, job, account_id, rows, cursor):
        self.db.rpc('of_stage_page', {'p_item': job['id'], 'p_lease': job['lease'],
            'p_account': account_id, 'p_rows': rows, 'p_cursor': cursor}).execute()

    def finish(self, job, complete, failed=False):
        self.db.rpc('of_finish_sync', {'p_item': job['id'], 'p_lease': job['lease'],
            'p_complete': complete, 'p_failed': failed}).execute()


class Runtime:
    def __init__(self):
        from supabase import create_client
        self.create = create_client
        self.url = os.getenv('SUPABASE_URL', '')
        self.key = os.getenv('SUPABASE_KEY', '')

    def auth_client(self):
        if not self.url or not self.key:
            raise FinanceError()
        # A fresh auth client prevents sign-in from replacing the service DB JWT.
        return self.create(self.url, self.key)

    def user(self, token):
        try:
            user = self.auth_client().auth.get_user(token).user
            return str(UUID(str(user.id)))
        except Exception:
            raise FinanceError(401, 'Authentication required') from None

    def login(self, email, password):
        result = self.auth_client().auth.sign_in_with_password({'email': email, 'password': password})
        if not result.session:
            raise FinanceError(401, 'Authentication failed')
        return result.session.access_token

    def store(self):
        key = self.key
        if key_kind(key) not in ('service_role', 'secret'):
            key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
        if not self.url or key_kind(key) not in ('service_role', 'secret'):
            raise FinanceError(503, 'Privileged staging access unavailable')
        return SupabaseStore(self.create(self.url, key))


def sync_one(client, store, job, page_budget=10, deadline=None):
    """Bounded full sweeps revisit pending updates; checkpoints resume interruptions."""
    deadline = deadline if deadline is not None else time.monotonic() + 15
    item = client.item(job['id'])
    if item.get('clientUserId') != job['client_user_id']:
        raise PluggyError('Pluggy ownership mismatch')
    store.verify_scope(job, item_scope(item))
    statuses = {'UPDATED','UPDATING','WAITING_USER_INPUT','WAITING_USER_ACTION','MERGING',
                'LOGIN_ERROR','OUTDATED','PARTIAL_SUCCESS'}
    status = item.get('status') if item.get('status') in statuses else 'UNKNOWN'
    store.item_status(job, status)
    if status != 'UPDATED':
        raise PluggyError('Pluggy item not ready')
    accounts = list(client.accounts(job['id']))
    # Bound execution before writes and reject duplicate/mismatched identities.
    ids = set()
    for account in accounts:
        identifier(account.get('id'))
        if account.get('itemId') != job['id'] or account['id'] in ids:
            raise PluggyError('Invalid Pluggy account')
        ids.add(account['id'])
    for check in store.deletions(job):
        if time.monotonic() >= deadline:
            return False
        if check['account_id'] not in ids:
            raise PluggyError('Deletion account unavailable')
        missing = client.transaction_missing(check['account_id'],check['external_id'])
        store.resolve_deletion(job,check,missing)
    # Complete accounts last to allow a large account to resume first next time.
    checkpoints = [(account, store.account(job, normalized_account(account))) for account in accounts]
    checkpoints.sort(key=lambda pair: pair[1].get('last_synced_at') or '')
    for account, checkpoint in checkpoints:
        cursor = checkpoint.get('cursor')
        seen = {cursor} if cursor else set()
        while True:
            if page_budget <= 0 or time.monotonic() >= deadline:
                return False
            rows, next_cursor = client.transaction_page(account['id'], cursor)
            if next_cursor and next_cursor in seen:
                raise PluggyError('Repeated Pluggy cursor')
            normalized = [normalized_transaction(row, account['id'], account) for row in rows]
            store.page(job, account['id'], normalized, next_cursor)
            page_budget -= 1
            if not next_cursor:
                break
            seen.add(next_cursor)
            cursor = next_cursor
    return not bool(store.deletions(job))


def finite_number(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise PluggyError('Invalid Pluggy amount')
    return value


def normalized_account(row):
    if row.get('type') not in ('BANK', 'CREDIT') or not valid_currency(row.get('currencyCode')):
        raise PluggyError('Invalid Pluggy account schema')
    return {'id': row['id'], 'kind': row['type'], 'currency': row['currencyCode'][:3],
            'balance': finite_number(row.get('balance'))}


def valid_currency(value):
    return isinstance(value, str) and len(value) == 3 and all('A' <= c <= 'Z' for c in value)


def normalized_transaction(row, account_id, account=None):
    if not isinstance(row, dict) or row.get('accountId') != account_id:
        raise PluggyError('Pluggy account mismatch')
    identifier(row.get('id'))
    try:
        date = datetime.fromisoformat(row['date'].replace('Z', '+00:00'))
        if date.tzinfo is None:
            raise ValueError()
    except (ValueError, KeyError, TypeError, AttributeError):
        raise PluggyError('Invalid Pluggy transaction date') from None
    if row.get('type') not in ('CREDIT', 'DEBIT') or not valid_currency(row.get('currencyCode')):
        raise PluggyError('Invalid Pluggy transaction schema')
    metadata = {}
    category = row.get('categoryId')
    if isinstance(category, str) and 0 < len(category) <= 255:
        metadata['category_id'] = category
    card = row.get('creditCardMetadata') or {}
    if not isinstance(card, dict):
        raise PluggyError('Invalid card metadata')
    for key in ('installmentNumber','totalInstallments'):
        value = card.get(key)
        if type(value) is int and 1 <= value <= 1000:
            metadata[key] = value
    for key in ('billId','billForecastDate','paymentType'):
        if isinstance(card.get(key), str):
            metadata[key] = card[key][:255]
    if account and account.get('type') == 'CREDIT' and row['type'] == 'DEBIT' and card.get('paymentType') in ('SINGLE','INSTALLMENT'):
        metadata['semantic_hint'] = 'card_purchase'
    # Compare complete provider documents transiently; never store CPF/CNPJ.
    payment = row.get('paymentData') or {}
    if account and account.get('type') == 'BANK' and isinstance(payment, dict):
        def document(value):
            if not isinstance(value, str) or any(c not in '0123456789.-/ ' for c in value):
                return None
            digits = ''.join(c for c in value if c.isdigit())
            return digits if len(digits) in (11,14) else None
        own = document(account.get('taxNumber'))
        def participant(name):
            part = payment.get(name) or {}
            doc = part.get('documentNumber') if isinstance(part, dict) else None
            return document(doc.get('value')) if isinstance(doc, dict) else None
        if own and participant('payer') == own and participant('receiver') == own:
            metadata['semantic_hint'] = 'own_transfer'
    return {'external_id': row['id'], 'bank_status': row.get('status') if row.get('status') in
            ('PENDING', 'POSTED') else 'UNKNOWN', 'amount': finite_number(row.get('amount')),
            'currency': row['currencyCode'][:3], 'occurred_at': row['date'], 'direction': row['type'], 'metadata': metadata}


def register_open_finance(app, client_factory=None, services_factory=None):
    bp = Blueprint('open_finance', __name__)
    runtime = services_factory or Runtime
    provider = client_factory or (lambda: PluggyClient(os.getenv('PLUGGY_CLIENT_ID'), os.getenv('PLUGGY_CLIENT_SECRET')))

    def throttle(subject, limit):
        bucket = hashlib.sha256(subject.encode()).hexdigest()
        if not runtime().store().rate_limit(bucket, limit):
            raise FinanceError(429, 'Too many requests')

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise FinanceError(400, 'JSON object required')
        return value

    def secure():
        # Vercel overwrites X-Forwarded-Proto at its trusted edge. Outside Vercel,
        # require native HTTPS and do not trust arbitrary forwarded headers.
        return request.is_secure or (os.getenv('VERCEL') == '1' and
                                      request.headers.get('X-Forwarded-Proto') == 'https')

    def user():
        header = request.headers.get('Authorization', '')
        token = header[7:] if header.startswith('Bearer ') else request.cookies.get('of_session', '')
        if not token:
            raise FinanceError(401, 'Authentication required')
        throttle('auth:' + (request.remote_addr or 'unknown'), 120)
        owner = runtime().user(token)
        throttle('user:' + owner, 120)
        return owner

    def shared_auth(name):
        secret = os.getenv(name, '')
        value = request.headers.get('Authorization', '')
        if len(secret) < 32:
            raise FinanceError()
        if not hmac.compare_digest(value.encode(), ('Bearer ' + secret).encode()):
            raise FinanceError(401, 'Authentication required')

    @bp.before_request
    def guard():
        if request.endpoint == 'open_finance.page':
            return
        if os.getenv('PLUGGY_ENABLED') != 'true':
            raise FinanceError(404, 'Open Finance disabled')
        if data_scope() == 'production' and (os.getenv('OPEN_FINANCE_RELEASE_APPROVED') != 'true' or
                os.getenv('OPEN_FINANCE_DASHBOARD') != 'true'):
            raise FinanceError(503, 'Production release not approved')
        if request.content_length and request.content_length > 16384:
            raise FinanceError(413, 'Request too large')
        if request.method != 'GET' and (request.endpoint == 'open_finance.login' or
                not request.headers.get('Authorization', '').startswith('Bearer ')):
            # Cookie authentication: exact origin check also protects login CSRF.
            origin = ('https' if secure() else request.scheme) + '://' + request.host
            if request.headers.get('Origin') != origin:
                raise FinanceError(403, 'Origin rejected')

    @bp.errorhandler(FinanceError)
    def finance_error(error):
        return jsonify(error=error.message), error.status

    @bp.errorhandler(Exception)
    def safe_error(error):
        # No provider exceptions, financial payloads or credentials in logs/API.
        return jsonify(error='Open Finance operation failed'), 502

    @bp.after_request
    def private(response):
        response.headers['Cache-Control'] = 'no-store, private'
        response.headers['Vary'] = 'Cookie, Authorization'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        if request.endpoint == 'open_finance.page':
            response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' https://connect.pluggy.ai; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    @bp.get('/open-finance')
    def page():
        return render_template('open_finance.html', enabled=os.getenv('PLUGGY_ENABLED') == 'true', mode=data_scope())

    @bp.post('/api/open-finance/session')
    def login():
        if not secure():
            raise FinanceError(400, 'HTTPS required')
        # Use the platform-overwritten address only on Vercel; never store raw IPs.
        address = request.headers.get('X-Vercel-Forwarded-For', request.remote_addr or 'unknown') if os.getenv('VERCEL') == '1' else request.remote_addr or 'unknown'
        throttle('login:' + address, 10)
        data = body()
        email, password = data.get('email'), data.get('password')
        if not isinstance(email, str) or not isinstance(password, str):
            raise FinanceError(400, 'Invalid login')
        try:
            token = runtime().login(email, password)
        except Exception:
            raise FinanceError(401, 'Authentication failed') from None
        response = jsonify(authenticated=True)
        response.set_cookie('of_session', token, secure=True, httponly=True, samesite='Strict',
                            path='/api/open-finance', max_age=3600)
        return response

    @bp.delete('/api/open-finance/session')
    def logout():
        response = jsonify(authenticated=False)
        response.delete_cookie('of_session', path='/api/open-finance', secure=True, httponly=True, samesite='Strict')
        return response

    @bp.get('/api/open-finance/inventory')
    def inventory():
        owner = user()
        return jsonify(runtime().store().inventory(owner))

    @bp.post('/api/open-finance/connect-token')
    def connect():
        owner = user()
        throttle('connect:' + owner, 5)
        if body().get('consent') is not True:
            raise FinanceError(400, 'Explicit consent required')
        client = provider()
        try:
            connector_ids = client.sandbox_connectors() if data_scope() == 'sandbox' else None
            consent = runtime().store().new_consent(owner)
            return jsonify(consentId=consent['id'], accessToken=client.connect_token(consent['client_user_id']),
                           includeSandbox=data_scope() == 'sandbox',connectorIds=connector_ids)
        finally:
            client.close()

    @bp.post('/api/open-finance/items')
    def bind():
        owner = user()
        data = body()
        consent_id = str(UUID(data.get('consentId', '')))
        item_id = identifier(data.get('itemId'))
        store = runtime().store()
        consent = store.consent(owner, consent_id)
        client = provider()
        try:
            item = client.item(item_id)
            if item['clientUserId'] != consent['client_user_id']:
                raise FinanceError(403, 'Item ownership rejected')
            store.bind(owner, consent_id, item, item_scope(item))
            return jsonify(registered=True), 201
        finally:
            client.close()

    @bp.post('/api/open-finance/items/<item_id>/connect-token')
    def reconnect(item_id):
        owner = user()
        throttle('connect:' + owner, 5)
        if body().get('consent') is not True:
            raise FinanceError(400, 'Explicit consent required')
        store = runtime().store()
        consent = store.registered_item(owner, identifier(item_id))
        client = provider()
        try:
            item = client.item(item_id)
            if item['clientUserId'] != consent['client_user_id']:
                raise FinanceError(403, 'Item ownership rejected')
            scope = item_scope(item)
            store.renew(owner, item_id, consent['client_user_id'], scope)
            return jsonify(consentId=consent['id'], updateItem=item_id,
                includeSandbox=scope == 'sandbox',connectorIds=[item['connector']['id']] if scope=='sandbox' else None,
                accessToken=client.connect_token(consent['client_user_id'], item_id))
        finally:
            client.close()

    @bp.get('/api/open-finance/dashboard')
    def dashboard():
        owner = user()
        month = request.args.get('month') or datetime.now(ZoneInfo('America/Sao_Paulo')).strftime('%Y-%m')
        try:
            if len(month) != 7:
                raise ValueError()
            datetime.strptime(month, '%Y-%m')
        except ValueError:
            raise FinanceError(400, 'Invalid month') from None
        data = runtime().store().review_data(owner)
        result = build_dashboard(data, month, data_scope())
        return jsonify(result)

    @bp.post('/api/open-finance/reconcile')
    def reconcile():
        owner = user()
        data = body()
        allowed = {'account_id','external_id','revision','kind','reason','other_account_id','other_external_id',
                   'other_revision','legacy_table','legacy_id','legacy_occurrence','save_rule'}
        action = {key: value for key, value in data.items() if key in allowed}
        identifier(action.get('account_id')); identifier(action.get('external_id'))
        if type(action.get('revision')) is not int or not isinstance(action.get('reason'), str):
            raise FinanceError(400, 'Invalid decision')
        try:
            request_id = str(UUID(data.get('request_id', '')))
            decision = runtime().store().decide(owner, request_id, action)
        except ValueError:
            raise FinanceError(400, 'Invalid request ID') from None
        return jsonify(decision_id=decision)

    @bp.delete('/api/open-finance/rules/<rule_id>')
    def disable_rule(rule_id):
        runtime().store().disable_rule(user(), str(UUID(rule_id)))
        return jsonify(disabled=True)

    @bp.delete('/api/open-finance/consents/<consent_id>')
    def revoke(consent_id):
        owner = user()
        runtime().store().revoke(owner, str(UUID(consent_id)))
        return jsonify(revoked=True)

    @bp.post('/api/open-finance/sync')
    def enqueue():
        owner = user()
        # No client account_id or owner_id is used, including unexpected fields.
        runtime().store().enqueue(owner)
        return jsonify(queued=True), 202

    @bp.route('/api/open-finance/jobs/sync', methods=['GET', 'POST'])
    def scheduled():
        shared_auth('CRON_SECRET')
        store = runtime().store()
        processed = 0
        deadline = time.monotonic() + 20
        while processed < 3 and time.monotonic() < deadline:
            job = store.claim()
            if not job:
                break
            client = None
            try:
                client = provider()
                client.deadline = deadline
                complete = sync_one(client, store, job, deadline=deadline)
                store.auto_review(job)
                store.finish(job, complete)
                processed += 1
                if not complete:
                    break
            except Exception:
                store.finish(job, False, failed=True)
                return jsonify(error='Sync deferred', processed=processed), 502
            finally:
                if client:
                    client.close()
        return jsonify(processed=processed)

    @bp.post('/api/open-finance/webhook')
    def webhook():
        shared_auth('OPEN_FINANCE_WEBHOOK_TOKEN')
        data = request.get_json(silent=True) or {}
        if data.get('event') not in ('item/created', 'item/updated', 'transactions/created',
                                   'transactions/updated', 'transactions/deleted', 'item/deleted'):
            raise FinanceError(400, 'Unsupported event')
        deleted_ids, account_id = [], None
        if data['event'] == 'transactions/deleted':
            account_id = identifier(data.get('accountId'))
            values = data.get('transactionIds')
            if not isinstance(values,list) or not 1 <= len(values) <= 100:
                raise FinanceError(400,'Invalid deletion event')
            deleted_ids = [identifier(value) for value in values]
        runtime().store().webhook(identifier(data.get('eventId')), identifier(data.get('itemId')),account_id,deleted_ids)
        return jsonify(accepted=True), 202

    app.register_blueprint(bp)
