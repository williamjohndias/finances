"""Opt-in official sandbox contract check; never read a real bank account."""
import os
import unittest

from open_finance import normalized_account, normalized_transaction
from pluggy_integration import PluggyClient


@unittest.skipUnless(os.getenv('PLUGGY_SANDBOX_TESTS') == 'true' and all(os.getenv(name) for name in
    ('PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET', 'PLUGGY_SANDBOX_ITEM_ID')),
    'Sandbox consent/bindings unavailable; live contract not validated')
class PluggySandboxContract(unittest.TestCase):
    def test_synthetic_item_account_and_transaction_contract(self):
        client = PluggyClient(os.environ['PLUGGY_CLIENT_ID'], os.environ['PLUGGY_CLIENT_SECRET'])
        self.addCleanup(client.close)
        item_id = os.environ['PLUGGY_SANDBOX_ITEM_ID']
        item = client.item(item_id)
        # Do not include the provider response in assertion failures.
        self.assertTrue(item.get('connector', {}).get('isSandbox') is True, 'Sandbox connector required')
        self.assertTrue(item['connector'].get('id') in client.sandbox_connectors(), 'Sandbox connector allowlist must include the fixture')
        accounts = list(client.accounts(item_id))
        self.assertTrue(bool(accounts), 'Sandbox fixture must contain an account')
        total = 0
        for account in accounts:
            normalized_account(account)
            for row in client.transactions(account['id']):
                normalized_transaction(row, account['id'])
                total += 1
        self.assertTrue(total > 0, 'Sandbox fixture must contain transactions')
