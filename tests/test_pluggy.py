import os
import unittest
from unittest.mock import patch

import httpx
from flask import Flask

from pluggy_integration import PluggyClient, PluggyError, register_pluggy, stage_account


class Database:
    def __init__(self):
        self.rows = {}

    def table(self, name):
        assert name == 'open_finance_transactions'
        return self

    def upsert(self, row, on_conflict):
        assert on_conflict == 'provider,account_id,external_id'
        self.rows[(row['provider'], row['account_id'], row['external_id'])] = row
        return self

    def execute(self):
        return None


class PluggyTests(unittest.TestCase):
    def client(self, handler):
        client = PluggyClient('test-id', 'test-secret', httpx.MockTransport(handler))
        self.addCleanup(client.close)
        return client

    def test_auth_and_connect_token(self):
        calls = []

        def handler(request):
            calls.append(request)
            if request.url.path == '/auth':
                self.assertIn(b'"clientSecret":"test-secret"', request.content.replace(b' ', b''))
                return httpx.Response(200, json={'apiKey': 'backend-only'})
            self.assertEqual(request.headers['X-API-KEY'], 'backend-only')
            self.assertEqual(request.url.path, '/connect_token')
            return httpx.Response(200, json={'accessToken': 'short-lived'})

        client = self.client(handler)
        self.assertEqual(client.connect_token(), 'short-lived')
        client.connect_token()
        self.assertEqual(sum(r.url.path == '/auth' for r in calls), 1)

    def test_cursor_pagination_fixed_host_and_idempotent_pending_update(self):
        status = ['PENDING']

        def handler(request):
            self.assertEqual(request.url.host, 'api.pluggy.ai')
            if request.url.path == '/auth':
                return httpx.Response(200, json={'apiKey': 'key'})
            self.assertEqual(request.url.params['accountId'], 'account')
            after = request.url.params.get('after')
            row = {'id': 'two' if after else 'one', 'accountId': 'account',
                   'status': status[0], 'amount': 123}
            return httpx.Response(200, json={'results': [row], 'next':
                None if after else 'https://untrusted.example/path?after=cursor'})

        client = self.client(handler)
        database = Database()
        self.assertEqual(stage_account(client, database, 'item', 'account'), 2)
        status[0] = 'POSTED'
        self.assertEqual(stage_account(client, database, 'item', 'account'), 2)
        self.assertEqual(len(database.rows), 2)
        self.assertTrue(all(r['bank_status'] == 'POSTED' for r in database.rows.values()))
        self.assertTrue(all('reconciliation_status' not in r for r in database.rows.values()))

    def test_errors_are_sanitized(self):
        for code, body in [(401, {'error': 'SECRET'}), (429, {'error': 'SECRET'}),
                           (500, {'error': 'SECRET'}), (200, [])]:
            with self.subTest(code=code):
                client = self.client(lambda r: httpx.Response(code, json=body))
                with self.assertRaises(PluggyError) as error:
                    client.connect_token()
                self.assertNotIn('SECRET', str(error.exception))

    def test_timeout_is_sanitized(self):
        def handler(request):
            raise httpx.ReadTimeout('SECRET', request=request)
        with self.assertRaisesRegex(PluggyError, '^Pluggy request failed$'):
            self.client(handler).connect_token()

    def test_repeated_cursor_fails_instead_of_looping(self):
        client = self.client(lambda r: httpx.Response(200, json={
            'results': [], 'next': '?after=same'}))
        client.api_key = 'key'
        with self.assertRaises(PluggyError):
            list(client.transactions('account'))

    def test_wrong_account_never_written(self):
        class Client:
            def transactions(self, account_id):
                return [{'id': 'id', 'accountId': 'other'}]
        database = Database()
        with self.assertRaises(PluggyError):
            stage_account(Client(), database, 'item', 'account')
        self.assertFalse(database.rows)

    def test_distinct_ids_with_same_amount_not_deduplicated(self):
        class Client:
            def transactions(self, account_id):
                return [{'id': i, 'accountId': account_id, 'amount': 10,
                         'status': 'unexpected'} for i in ('one', 'two')]
        database = Database()
        stage_account(Client(), database, 'item', 'account')
        self.assertEqual(len(database.rows), 2)
        self.assertTrue(all(r['bank_status'] == 'UNKNOWN' for r in database.rows.values()))

    def test_endpoint_disabled_and_authorized(self):
        class Client:
            closed = False
            def connect_token(self):
                return 'temporary-token'
            def close(self):
                self.closed = True
        provider = Client()
        app = Flask(__name__)
        register_pluggy(app, lambda: provider)
        browser = app.test_client()
        path = '/api/open-finance/connect-token'
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(browser.post(path).status_code, 404)
        with patch.dict(os.environ, {'PLUGGY_ENABLED': 'true'}, clear=True):
            self.assertEqual(browser.post(path).status_code, 503)
        settings = {'PLUGGY_ENABLED': 'true', 'OPEN_FINANCE_ADMIN_TOKEN': 'a' * 40}
        with patch.dict(os.environ, settings, clear=True):
            self.assertEqual(browser.post(path).status_code, 401)
            response = browser.post(path, headers={'Authorization': 'Bearer ' + 'a' * 40})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {'accessToken': 'temporary-token'})
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertTrue(provider.closed)

    def test_endpoint_hides_provider_error(self):
        def fail():
            raise PluggyError('sensitive provider error')
        app = Flask(__name__)
        register_pluggy(app, fail)
        with patch.dict(os.environ, {'PLUGGY_ENABLED': 'true',
                                   'OPEN_FINANCE_ADMIN_TOKEN': 'a' * 40}, clear=True):
            response = app.test_client().post('/api/open-finance/connect-token',
                headers={'Authorization': 'Bearer ' + 'a' * 40})
        self.assertEqual(response.status_code, 502)
        self.assertNotIn(b'sensitive', response.data)


if __name__ == '__main__':
    unittest.main()
