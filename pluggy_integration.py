"""Opt-in Pluggy transport and staging; never posts into the financial ledger."""
import time
import random
from urllib.parse import parse_qs, urlparse

import httpx


class PluggyError(Exception):
    """Sanitized error: provider bodies may contain credentials or bank data."""


class PluggyClient:
    def __init__(self, client_id, client_secret, transport=None, sleep=time.sleep):
        if not client_id or not client_secret:
            raise PluggyError('Pluggy credentials unavailable')
        self.http = httpx.Client(base_url='https://api.pluggy.ai', timeout=30,
                                 transport=transport, follow_redirects=False)
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = None
        self.sleep = sleep
        self.deadline = None

    def close(self):
        self.http.close()

    def _request(self, method, path, **kwargs):
        try:
            for attempt in range(3):
                options = dict(kwargs)
                if self.deadline is not None:
                    remaining = self.deadline - time.monotonic()
                    if remaining <= .1:
                        raise PluggyError('Pluggy execution deadline')
                    options['timeout'] = min(remaining, 10)
                try:
                    response = self.http.request(method, path, **options)
                except httpx.TransportError:
                    if method != 'GET' or attempt == 2:
                        raise
                    self.sleep(min(2 ** attempt, 2))
                    continue
                # Retry only read operations: token creation is not idempotent.
                if method != 'GET' or response.status_code not in (429, 500, 502, 503, 504):
                    break
                if attempt == 2:
                    break
                try:
                    delay = float(response.headers.get('Retry-After', 2 ** attempt))
                except ValueError:
                    delay = 2 ** attempt
                self.sleep(min(max(delay, 0), 4) + random.uniform(0, .2))
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
                'clientId': self.client_id, 'clientSecret': self.client_secret, 'nonExpiring': False})
            self.api_key = auth.get('apiKey')
            if not isinstance(self.api_key, str) or not self.api_key:
                raise PluggyError('Pluggy authentication failed')
        return self._request(method, path, headers={'X-API-KEY': self.api_key}, **kwargs)

    def connect_token(self, client_user_id=None):
        body = {'options': {'clientUserId': client_user_id, 'avoidDuplicates': True}} if client_user_id else {}
        data = self._authorized('POST', '/connect_token', json=body)
        token = data.get('accessToken')
        if not isinstance(token, str) or not token:
            raise PluggyError('Pluggy connect token unavailable')
        return token

    def item(self, item_id):
        from urllib.parse import quote
        data = self._authorized('GET', '/items/' + quote(item_id, safe=''))
        if data.get('id') != item_id or not isinstance(data.get('clientUserId'), str):
            raise PluggyError('Invalid Pluggy item')
        return data

    def accounts(self, item_id):
        page = 1
        while page <= 100:
            data = self._authorized('GET', '/accounts', params={'itemId': item_id, 'page': page, 'pageSize': 100})
            rows = data.get('results')
            total_pages = data.get('totalPages')
            if not isinstance(rows, list) or type(total_pages) is not int or total_pages < page:
                # Empty collections may report zero pages.
                if page == 1 and rows == [] and total_pages == 0:
                    return
                raise PluggyError('Invalid Pluggy account pagination')
            yield from rows
            if page >= total_pages:
                return
            page += 1
        raise PluggyError('Pluggy account page limit exceeded')

    def transaction_page(self, account_id, after=None):
        params = {'accountId': account_id}
        if after:
            params['after'] = after
        data = self._authorized('GET', '/v2/transactions', params=params)
        if not isinstance(data.get('results'), list) or 'next' not in data:
            raise PluggyError('Invalid Pluggy pagination')
        next_url = data['next']
        if next_url is None:
            return data['results'], None
        if not isinstance(next_url, str):
            raise PluggyError('Invalid Pluggy cursor')
        cursor = parse_qs(urlparse(next_url).query).get('after', [None])[0]
        if not cursor or cursor == after or len(cursor) > 4096:
            raise PluggyError('Invalid Pluggy cursor')
        return data['results'], cursor

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


def register_pluggy(app, client_factory=None, services_factory=None):
    # Legacy administrative Connect Token endpoint is replaced with user-scoped
    # consent endpoints. No shared admin token may claim another user's item.
    from open_finance import register_open_finance
    register_open_finance(app, client_factory, services_factory)
