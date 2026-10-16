"""Opt-in Pluggy transport and staging; never posts into the financial ledger."""
import hmac
import os
from urllib.parse import parse_qs, urlparse

import httpx
from flask import Blueprint, jsonify, request


class PluggyError(Exception):
    """Sanitized error: provider bodies may contain credentials or bank data."""


class PluggyClient:
    def __init__(self, client_id, client_secret, transport=None):
        if not client_id or not client_secret:
            raise PluggyError('Pluggy credentials unavailable')
        self.http = httpx.Client(base_url='https://api.pluggy.ai', timeout=30,
                                 transport=transport, follow_redirects=False)
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = None

    def close(self):
        self.http.close()

    def _request(self, method, path, **kwargs):
        try:
            response = self.http.request(method, path, **kwargs)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (httpx.HTTPError, ValueError):
            raise PluggyError('Pluggy request failed') from None

    def _authorized(self, method, path, **kwargs):
        if self.api_key is None:
            auth = self._request('POST', '/auth', json={
                'clientId': self.client_id, 'clientSecret': self.client_secret})
            self.api_key = auth.get('apiKey')
            if not isinstance(self.api_key, str) or not self.api_key:
                raise PluggyError('Pluggy authentication failed')
        return self._request(method, path, headers={'X-API-KEY': self.api_key}, **kwargs)

    def connect_token(self):
        data = self._authorized('POST', '/connect_token', json={})
        token = data.get('accessToken')
        if not isinstance(token, str) or not token:
            raise PluggyError('Pluggy connect token unavailable')
        return token

    def transactions(self, account_id):
        """Follow cursors on the fixed API host, never a provider-supplied URL."""
        after = None
        seen = set()
        while True:
            params = {'accountId': account_id}
            if after:
                params['after'] = after
            page = self._authorized('GET', '/v2/transactions', params=params)
            rows = page.get('results')
            if not isinstance(rows, list) or 'next' not in page:
                raise PluggyError('Invalid Pluggy pagination')
            yield from rows
            next_url = page['next']
            if next_url is None:
                return
            if not isinstance(next_url, str):
                raise PluggyError('Invalid Pluggy cursor')
            cursor = parse_qs(urlparse(next_url).query).get('after', [None])[0]
            if not cursor or cursor in seen:
                raise PluggyError('Invalid Pluggy cursor')
            seen.add(cursor)
            after = cursor


def stage_account(client, database, item_id, account_id):
    """Caller supplies a verified owned account; retries upsert the same rows.

    No cross-source matching or automatic accounting in this phase. All statuses
    remain unreconciled; even POSTED does not imply income or expense.
    """
    count = 0
    for transaction in client.transactions(account_id):
        if not isinstance(transaction, dict) or not transaction.get('id'):
            raise PluggyError('Invalid Pluggy transaction')
        if transaction.get('accountId') != account_id:
            raise PluggyError('Pluggy account mismatch')
        status = transaction.get('status', 'UNKNOWN')
        if status not in ('POSTED', 'PENDING'):
            status = 'UNKNOWN'
        database.table('open_finance_transactions').upsert({
            'provider': 'pluggy', 'item_id': item_id,
            'account_id': account_id, 'external_id': str(transaction['id']),
            'bank_status': status, 'payload': transaction,
        }, on_conflict='provider,account_id,external_id').execute()
        count += 1
    return count


def register_pluggy(app, client_factory=None):
    bp = Blueprint('pluggy', __name__)

    @bp.post('/api/open-finance/connect-token')
    def connect_token():
        if os.getenv('PLUGGY_ENABLED') != 'true':
            return jsonify(error='Open Finance disabled'), 404
        admin_token = os.getenv('OPEN_FINANCE_ADMIN_TOKEN', '')
        if len(admin_token) < 32:
            return jsonify(error='Open Finance authorization unavailable'), 503
        expected = 'Bearer ' + admin_token
        if not hmac.compare_digest(request.headers.get('Authorization', '').encode(),
                                   expected.encode()):
            return jsonify(error='Unauthorized'), 401
        client = None
        try:
            client = (client_factory() if client_factory else PluggyClient(
                os.getenv('PLUGGY_CLIENT_ID'), os.getenv('PLUGGY_CLIENT_SECRET')))
            return jsonify(accessToken=client.connect_token())
        except PluggyError:
            return jsonify(error='Pluggy unavailable'), 502
        finally:
            if client:
                client.close()

    @bp.after_request
    def no_store(response):
        response.headers['Cache-Control'] = 'no-store'
        return response

    app.register_blueprint(bp)
