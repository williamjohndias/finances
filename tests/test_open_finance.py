import base64
import contextlib
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
from flask import Flask

from open_finance import (FinanceError, Runtime, SupabaseStore, key_kind, register_open_finance,
                          sync_one, normalized_transaction)
from pluggy_integration import PluggyClient, PluggyError

OWNER = '11111111-1111-1111-1111-111111111111'
CONSENT = '22222222-2222-2222-2222-222222222222'
JOB = {'id': 'item', 'lease': 'lease', 'client_user_id': 'server-binding'}


def transaction(status='POSTED', external_id='tx'):
    return dict(id=external_id, accountId='account', amount=12.34, date='2026-10-16T12:00:00Z',
                type='DEBIT', currencyCode='BRL', status=status, description='PRIVATE DESCRIPTION')


class MemoryStore:
    def __init__(self):
        self.rows = {}
        self.cursor = None
        self.calls = []

    def account(self, job, account):
        self.calls.append(('account', account))
        return {'cursor': self.cursor, 'last_synced_at': None}

    def item_status(self, job, status):
        self.status = status

    def page(self, job, account_id, rows, cursor):
        for row in rows:
            self.rows[row['external_id']] = row
        self.cursor = cursor


class SyncTests(unittest.TestCase):
    def provider(self):
        client = Mock()
        client.item.return_value = {'id': 'item', 'clientUserId': 'server-binding', 'status': 'UPDATED'}
        client.accounts.return_value = [{'id': 'account', 'itemId': 'item', 'type': 'BANK',
                                         'currencyCode': 'BRL', 'balance': 100}]
        return client

    def test_resume_checkpoint_and_update_pending_without_duplicate(self):
        client = self.provider()
        client.transaction_page.side_effect = [([transaction('PENDING')], 'cursor'),
                                               ([transaction('POSTED')], None)]
        store = MemoryStore()
        self.assertFalse(sync_one(client, store, JOB, page_budget=1))
        self.assertEqual(store.cursor, 'cursor')
        self.assertTrue(sync_one(client, store, JOB))
        self.assertEqual(client.transaction_page.call_args.args, ('account', 'cursor'))
        self.assertEqual(len(store.rows), 1)
        self.assertEqual(store.rows['tx']['bank_status'], 'POSTED')
        self.assertNotIn('PRIVATE DESCRIPTION', json.dumps(store.rows))

    def test_identity_mismatch_before_any_write(self):
        client = self.provider()
        client.item.return_value['clientUserId'] = 'other'
        store = MemoryStore()
        with self.assertRaises(PluggyError): sync_one(client, store, JOB)
        self.assertFalse(store.calls)

    def test_account_from_different_item_rejected(self):
        client = self.provider()
        client.accounts.return_value[0]['itemId'] = 'other'
        with self.assertRaises(PluggyError): sync_one(client, MemoryStore(), JOB)

    def test_connection_not_updated_is_not_reported_as_synced(self):
        client = self.provider()
        client.item.return_value['status'] = 'LOGIN_ERROR'
        store = MemoryStore()
        with self.assertRaises(PluggyError): sync_one(client, store, JOB)
        self.assertEqual(store.status, 'LOGIN_ERROR')
        self.assertFalse(store.calls)
        client.accounts.assert_not_called()

    def test_schema_error_does_not_advance_checkpoint(self):
        client = self.provider()
        broken = transaction(); broken['amount'] = float('nan')
        client.transaction_page.return_value = ([broken], 'next')
        store = MemoryStore()
        with self.assertRaises(PluggyError): sync_one(client, store, JOB)
        self.assertIsNone(store.cursor)
        self.assertFalse(store.rows)

    def test_unrecognized_status_is_not_confirmed(self):
        self.assertEqual(normalized_transaction(transaction('ESTIMATE'), 'account')['bank_status'], 'UNKNOWN')

    def test_page_error_preserves_previous_checkpoint(self):
        client = self.provider()
        client.transaction_page.side_effect = [([transaction()], 'next'), PluggyError('unavailable')]
        store = MemoryStore()
        with self.assertRaises(PluggyError): sync_one(client, store, JOB)
        self.assertEqual(store.cursor, 'next')
        self.assertEqual(len(store.rows), 1)

    def test_repeated_cursor_is_rejected(self):
        client = self.provider()
        client.transaction_page.side_effect = [([], 'a'), ([], 'b'), ([], 'a')]
        with self.assertRaises(PluggyError): sync_one(client, MemoryStore(), JOB)


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.dict(os.environ, {'PLUGGY_ENABLED': 'true', 'CRON_SECRET': 'c' * 40,
            'OPEN_FINANCE_WEBHOOK_TOKEN': 'w' * 40}, clear=True)
        self.settings.start(); self.addCleanup(self.settings.stop)
        self.store = Mock()
        self.store.new_consent.return_value = {'id': CONSENT, 'client_user_id': 'server-binding'}
        self.store.consent.return_value = self.store.new_consent.return_value
        self.store.inventory.return_value = dict(items=[], consents=[], accounts=[], transactions=[],
                                                source='Pluggy', included_in_dashboard=False)
        self.runtime = Mock()
        def user(token):
            if token != 'valid-user': raise FinanceError(401, 'Authentication required')
            return OWNER
        self.runtime.user.side_effect = user
        self.runtime.store.return_value = self.store
        self.client = Mock()
        self.client.item.return_value = {'id': 'item', 'clientUserId': 'server-binding', 'connector': {'name': 'Sandbox'}}
        self.client.connect_token.return_value = 'temporary-token'
        app = Flask(__name__, template_folder=str(Path(__file__).parents[1] / 'templates'))
        register_open_finance(app, lambda: self.client, lambda: self.runtime)
        self.browser = app.test_client()
        self.headers = {'Authorization': 'Bearer valid-user'}

    def test_inventory_requires_verified_user_and_owner_filter(self):
        self.assertEqual(self.browser.get('/api/open-finance/inventory').status_code, 401)
        response = self.browser.get('/api/open-finance/inventory', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.store.inventory.assert_called_once_with(OWNER)
        self.assertFalse(response.json['included_in_dashboard'])
        self.assertIn('no-store', response.headers['Cache-Control'])

    def test_forged_token_not_trusted(self):
        response = self.browser.get('/api/open-finance/inventory', headers={'Authorization': 'Bearer forged'})
        self.assertEqual(response.status_code, 401)
        self.store.inventory.assert_not_called()

    def test_client_account_and_owner_ids_are_ignored(self):
        response = self.browser.post('/api/open-finance/sync', headers=self.headers,
                                     json={'account_id': 'victim', 'owner_id': 'victim'})
        self.assertEqual(response.status_code, 202)
        self.store.enqueue.assert_called_once_with(OWNER)

    def test_consent_is_explicit_and_binding_comes_from_server(self):
        path = '/api/open-finance/connect-token'
        self.assertEqual(self.browser.post(path, headers=self.headers, json={}).status_code, 400)
        response = self.browser.post(path, headers=self.headers,
                                     json={'consent': True, 'clientUserId': 'attacker'})
        self.assertEqual(response.status_code, 200)
        self.client.connect_token.assert_called_once_with('server-binding')

    def test_item_must_match_server_binding(self):
        self.client.item.return_value['clientUserId'] = 'victim'
        response = self.browser.post('/api/open-finance/items', headers=self.headers,
                                     json={'itemId': 'item', 'consentId': CONSENT})
        self.assertEqual(response.status_code, 403)
        self.store.bind.assert_not_called()

    def test_item_registration_and_revocation_owner_scoped(self):
        response = self.browser.post('/api/open-finance/items', headers=self.headers,
                                     json={'itemId': 'item', 'consentId': CONSENT})
        self.assertEqual(response.status_code, 201)
        self.store.bind.assert_called_once_with(OWNER, CONSENT, self.client.item.return_value)
        self.browser.delete('/api/open-finance/consents/' + CONSENT, headers=self.headers)
        self.store.revoke.assert_called_once_with(OWNER, CONSENT)

    def test_cron_rejects_user_token(self):
        response = self.browser.get('/api/open-finance/jobs/sync', headers=self.headers)
        self.assertEqual(response.status_code, 401)
        self.store.claim.assert_not_called()

    def test_cron_auth_and_empty_queue(self):
        self.store.claim.return_value = None
        response = self.browser.get('/api/open-finance/jobs/sync', headers={'Authorization': 'Bearer ' + 'c' * 40})
        self.assertEqual(response.json, {'processed': 0})

    def test_cron_failure_is_sanitized_and_releases_lease(self):
        self.store.claim.return_value = JOB
        self.client.item.side_effect = RuntimeError('PRIVATE BANK DATA')
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            response = self.browser.get('/api/open-finance/jobs/sync', headers={'Authorization': 'Bearer ' + 'c' * 40})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('PRIVATE', output.getvalue() + response.text)
        self.store.finish.assert_called_once_with(JOB, False, failed=True)
        self.client.close.assert_called_once()

    def test_webhook_auth_and_replay_key_only(self):
        path = '/api/open-finance/webhook'
        body = {'eventId': 'event', 'itemId': 'item', 'event': 'transactions/updated', 'amount': 9999}
        self.assertEqual(self.browser.post(path, headers=self.headers, json=body).status_code, 401)
        for _ in range(2):
            response = self.browser.post(path, headers={'Authorization': 'Bearer ' + 'w' * 40}, json=body)
            self.assertEqual(response.status_code, 202)
        self.store.webhook.assert_called_with('event', 'item')
        self.store.page.assert_not_called()

    def test_cookie_csrf_and_secure_session(self):
        self.runtime.login.return_value = 'valid-user'
        path = '/api/open-finance/session'
        body = {'email': 'sandbox@example.test', 'password': 'synthetic-password'}
        response = self.browser.post(path, base_url='https://localhost', headers={'Origin': 'https://evil.test'}, json=body)
        self.assertEqual(response.status_code, 403)
        response = self.browser.post(path, base_url='https://localhost', headers={'Origin': 'https://localhost'}, json=body)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('valid-user', response.text)
        for flag in ('Secure', 'HttpOnly', 'SameSite=Strict'):
            self.assertIn(flag, response.headers['Set-Cookie'])
        response = self.browser.post('/api/open-finance/sync', base_url='https://localhost',
                                     headers={'Origin': 'https://evil.test'})
        self.assertEqual(response.status_code, 403)

    def test_vercel_proxy_https_is_only_trusted_on_vercel(self):
        self.runtime.login.return_value = 'valid-user'
        kwargs = dict(headers={'Origin': 'https://localhost', 'X-Forwarded-Proto': 'https'},
                      json={'email': 'sandbox@example.test', 'password': 'synthetic'})
        response = self.browser.post('/api/open-finance/session', **kwargs)
        self.assertEqual(response.status_code, 403)
        with patch.dict(os.environ, {'VERCEL': '1'}):
            response = self.browser.post('/api/open-finance/session', **kwargs)
            self.assertEqual(response.status_code, 200)

    def test_disabled_gate_includes_jobs_and_webhooks(self):
        with patch.dict(os.environ, {'PLUGGY_ENABLED': 'false'}):
            for path in ('inventory', 'jobs/sync', 'webhook', 'connect-token'):
                response = self.browser.post('/api/open-finance/' + path, headers=self.headers) if path in ('webhook', 'connect-token') else self.browser.get('/api/open-finance/' + path, headers=self.headers)
                self.assertEqual(response.status_code, 404)
        self.store.claim.assert_not_called()


class CredentialAndTransportTests(unittest.TestCase):
    def test_key_metadata_only(self):
        def jwt(role):
            return 'e30.' + base64.urlsafe_b64encode(json.dumps({'role': role}).encode()).decode().rstrip('=') + '.synthetic'
        for role in ('anon', 'service_role'):
            self.assertEqual(key_kind(jwt(role)), role)
        self.assertEqual(key_kind('sb_publishable_synthetic'), 'publishable')
        self.assertEqual(key_kind('sb_secret_synthetic'), 'secret')
        self.assertEqual(key_kind('broken'), 'unknown')

    def test_public_key_fails_closed_without_privileged_binding(self):
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://sandbox.example',
                                    'SUPABASE_KEY': 'sb_publishable_synthetic'}, clear=True):
            with self.assertRaises(FinanceError): Runtime().store()

    def test_auth_client_does_not_replace_database_authorization(self):
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://sandbox.example',
                                    'SUPABASE_KEY': 'sb_secret_synthetic'}, clear=True):
            runtime = Runtime(); runtime.create = Mock(side_effect=[Mock(), Mock()])
            auth = runtime.auth_client(); store = runtime.store()
            self.assertIsNot(auth, store.db)

    def test_get_retries_rate_limit_but_token_post_does_not(self):
        requests, delays = [], []
        def handler(request):
            requests.append(request)
            if len(requests) < 3:
                return httpx.Response(429, headers={'Retry-After': '0'}, json={})
            return httpx.Response(200, json={'id': 'item', 'clientUserId': 'binding'})
        client = PluggyClient('synthetic-id', 'synthetic-secret', httpx.MockTransport(handler), sleep=delays.append)
        self.addCleanup(client.close); client.api_key = 'synthetic-key'
        self.assertEqual(client.item('item')['id'], 'item')
        self.assertEqual(len(delays), 2)
        requests.clear()
        with self.assertRaises(PluggyError): client.connect_token()
        self.assertEqual(len(requests), 1)

    def test_accounts_pagination_and_schema(self):
        def handler(request):
            page = int(request.url.params['page'])
            return httpx.Response(200, json={'results': [{'id': str(page)}], 'totalPages': 2})
        client = PluggyClient('synthetic-id', 'synthetic-secret', httpx.MockTransport(handler))
        self.addCleanup(client.close); client.api_key = 'synthetic-key'
        self.assertEqual([a['id'] for a in client.accounts('item')], ['1', '2'])

    def test_inventory_selects_do_not_expose_provider_payload(self):
        db = Mock(); query = db.table.return_value
        for method in ('select', 'eq', 'order', 'limit'):
            getattr(query, method).return_value = query
        query.execute.return_value.data = []
        SupabaseStore(db).inventory(OWNER)
        for call in query.select.call_args_list:
            self.assertNotIn('payload', call.args[0])
            self.assertNotIn('*', call.args[0])
        for call in query.eq.call_args_list:
            self.assertEqual(call.args, ('owner_id', OWNER))


class RegressionTests(unittest.TestCase):
    def test_flask_vercel_existing_pages_and_staging(self):
        with patch.dict(os.environ, {'PLUGGY_ENABLED': 'false'}, clear=True):
            from app import app
            from api.index import application
            self.assertIs(app, application)
            client = app.test_client()
            for path in ('/', '/manifest.json', '/sw.js', '/api/version', '/open-finance',
                         '/static/js/open-finance.js', '/static/css/open-finance.css'):
                with client.get(path) as response:
                    self.assertEqual(response.status_code, 200, path)
            self.assertNotIn(b'id="login"', client.get('/open-finance').data)

    def test_worker_never_caches_bank_routes(self):
        script = (Path(__file__).parents[1] / 'templates/static/sw.js').read_text()
        self.assertLess(script.index("url.pathname === '/open-finance'"), script.index('cache.put'))
        self.assertIn("fetch(req, { cache: 'no-store' })", script)
        ui = (Path(__file__).parents[1] / 'templates/static/js/open-finance.js').read_text()
        for forbidden in ('innerHTML', 'localStorage', 'sessionStorage', 'console.log'):
            self.assertNotIn(forbidden, ui)


if __name__ == '__main__':
    unittest.main()
