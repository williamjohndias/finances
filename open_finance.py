"""User-scoped Open Finance staging. No writes to the legacy financial ledger."""
import base64
import hmac
import json
import math
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

from flask import Blueprint, jsonify, render_template, request

from pluggy_integration import PluggyClient, PluggyError


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
        row = {'owner_id': owner, 'client_user_id': secrets.token_urlsafe(32),
               'expires_at': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()}
        return self.db.table('of_consents').insert(row).execute().data[0]

    def consent(self, owner, consent_id):
        rows = self.db.table('of_consents').select('*').eq('owner_id', owner).eq(
            'id', consent_id).is_('revoked_at', 'null').gt(
            'expires_at', datetime.now(timezone.utc).isoformat()).execute().data
        if not rows:
            raise FinanceError(404, 'Consent unavailable')
        return rows[0]

    def bind(self, owner, consent_id, item):
        return self.db.rpc('of_bind_item', {'p_owner': owner, 'p_consent': consent_id,
            'p_item': item['id'], 'p_binding': item['clientUserId'],
            'p_connector': str(item.get('connector', {}).get('name', 'Pluggy'))[:120]}).execute().data

    def revoke(self, owner, consent_id):
        self.db.table('of_consents').update({'revoked_at': datetime.now(timezone.utc).isoformat()}).eq(
            'owner_id', owner).eq('id', consent_id).execute()

    def inventory(self, owner):
        # Whitelists: never serialize provider payloads, tokens or personal IDs.
        items = self.db.table('of_items').select(
            'id,consent_id,connector,status,provider_status,last_synced_at,error_code').eq('owner_id', owner).execute().data
        consents = self.db.table('of_consents').select('id,expires_at,revoked_at').eq('owner_id', owner).execute().data
        accounts = self.db.table('of_accounts').select(
            'id,item_id,kind,currency,balance,observed_at,last_synced_at').eq('owner_id', owner).execute().data
        transactions = self.db.table('open_finance_transactions').select(
            'account_id,external_id,bank_status,reconciliation_status,amount,currency,occurred_at,direction').eq(
                'owner_id', owner).order('first_seen_at', desc=True).limit(100).execute().data
        return dict(items=items, consents=consents, accounts=accounts, transactions=transactions,
                    source='Pluggy / Open Finance', included_in_dashboard=False)

    def enqueue(self, owner):
        self.db.table('of_items').update({'sync_requested': True}).eq('owner_id', owner).execute()

    def webhook(self, event_id, item_id):
        return self.db.rpc('of_enqueue_event', {'p_event': event_id, 'p_item': item_id}).execute().data

    def claim(self):
        rows = self.db.rpc('of_claim_sync').execute().data
        return rows[0] if rows else None

    def account(self, job, account):
        return self.db.rpc('of_stage_account', {'p_item': job['id'], 'p_lease': job['lease'],
            'p_account': account}).execute().data

    def item_status(self, job, status):
        self.db.rpc('of_item_status', {'p_item': job['id'], 'p_lease': job['lease'],
                                     'p_status': status}).execute()

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
            normalized = [normalized_transaction(row, account['id']) for row in rows]
            store.page(job, account['id'], normalized, next_cursor)
            page_budget -= 1
            if not next_cursor:
                break
            seen.add(next_cursor)
            cursor = next_cursor
    return True


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


def normalized_transaction(row, account_id):
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
    return {'external_id': row['id'], 'bank_status': row.get('status') if row.get('status') in
            ('PENDING', 'POSTED') else 'UNKNOWN', 'amount': finite_number(row.get('amount')),
            'currency': row['currencyCode'][:3], 'occurred_at': row['date'], 'direction': row['type']}


def register_open_finance(app, client_factory=None, services_factory=None):
    bp = Blueprint('open_finance', __name__)
    runtime = services_factory or Runtime
    provider = client_factory or (lambda: PluggyClient(os.getenv('PLUGGY_CLIENT_ID'), os.getenv('PLUGGY_CLIENT_SECRET')))

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
        return runtime().user(token)

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
        if request.content_length and request.content_length > 16384:
            raise FinanceError(413, 'Request too large')
        if request.method != 'GET' and not request.headers.get('Authorization', '').startswith('Bearer '):
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
        return response

    @bp.get('/open-finance')
    def page():
        return render_template('open_finance.html', enabled=os.getenv('PLUGGY_ENABLED') == 'true')

    @bp.post('/api/open-finance/session')
    def login():
        if not secure():
            raise FinanceError(400, 'HTTPS required')
        data = request.get_json(silent=True) or {}
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
        if (request.get_json(silent=True) or {}).get('consent') is not True:
            raise FinanceError(400, 'Explicit consent required')
        consent = runtime().store().new_consent(owner)
        client = provider()
        try:
            return jsonify(consentId=consent['id'], accessToken=client.connect_token(consent['client_user_id']))
        finally:
            client.close()

    @bp.post('/api/open-finance/items')
    def bind():
        owner = user()
        data = request.get_json(silent=True) or {}
        consent_id = str(UUID(data.get('consentId', '')))
        item_id = identifier(data.get('itemId'))
        store = runtime().store()
        consent = store.consent(owner, consent_id)
        client = provider()
        try:
            item = client.item(item_id)
            if item['clientUserId'] != consent['client_user_id']:
                raise FinanceError(403, 'Item ownership rejected')
            store.bind(owner, consent_id, item)
            return jsonify(registered=True), 201
        finally:
            client.close()

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
        runtime().store().webhook(identifier(data.get('eventId')), identifier(data.get('itemId')))
        return jsonify(accepted=True), 202

    app.register_blueprint(bp)
