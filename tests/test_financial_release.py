import copy
from datetime import date
import json
import os
import unittest
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import Mock
from unittest.mock import patch

import test_open_finance as base
from financial_dashboard import build_dashboard
from open_finance import normalized_transaction, SupabaseStore, FinanceError


def bank(external_id='income', amount='100', kind='BANK', direction='CREDIT', status='POSTED', **extra):
    return dict(account_id='bank', external_id=external_id, amount=amount, currency='BRL',
        occurred_at='2026-10-10T12:00:00Z', direction=direction, bank_status=status, revision=1,
        account_kind=kind, category_id='salary', data_scope='sandbox', **extra)


def decision(row, kind, **extra):
    return dict(account_id=row['account_id'], external_id=row['external_id'], bank_revision=row['revision'], kind=kind, **extra)


class FinancialReadModelTests(unittest.TestCase):
    def dashboard(self, transactions, decisions=(), legacy=(), **extra):
        return build_dashboard(dict(transactions=transactions, decisions=decisions, legacy=legacy, **extra),
                               '2026-10', 'sandbox', date(2026, 10, 16))

    def test_bank_confirmed_is_primary_and_history_not_added_twice(self):
        row = bank()
        result = self.dashboard([row], [decision(row, 'income', legacy_table='transactions', legacy_id='salary')],
            [dict(source='transactions', id='salary', valor=100, tipo='receita', data='2026-10-10')])
        self.assertEqual(result['currencies']['BRL']['income'], '100.00')
        self.assertTrue(result['historical_not_added'])
        self.assertEqual(result['historical_count'], 1)

    def test_unreviewed_posted_does_not_become_income(self):
        result = self.dashboard([bank()])
        self.assertEqual(result['pending_count'], 1)
        self.assertNotIn('BRL', result['currencies'])

    def test_pending_and_future_never_count_as_realized(self):
        pending = bank(status='PENDING')
        future = bank('future'); future['occurred_at'] = '2026-10-25T12:00:00Z'
        result = self.dashboard([pending, future], [decision(pending, 'income'), decision(future, 'income')])
        self.assertEqual(result['pending_count'], 2)
        self.assertNotIn('BRL', result['currencies'])
        self.assertEqual(result['projections'][0]['source'], 'bank_future_unreconciled')

    def test_transfer_and_invoice_are_neutral(self):
        outgoing = bank('transfer', direction='DEBIT'); outgoing['account_id'] = 'a'
        incoming = bank('other'); incoming['account_id'] = 'b'
        paid = bank('payment', direction='DEBIT')
        result = self.dashboard([outgoing, incoming, paid], [
            decision(outgoing, 'own_transfer', other_account_id='b', other_external_id='other', other_revision=1),
            decision(incoming, 'own_transfer', other_account_id='a', other_external_id='transfer', other_revision=1),
            decision(paid, 'invoice_payment', legacy_table='abatimentos', legacy_id='paid')])
        self.assertEqual(result['currencies']['BRL']['net_realized'], '0.00')
        self.assertEqual(result['currencies']['BRL']['invoice_paid'], '100.00')

    def test_changed_counterpart_invalidates_both_financial_legs(self):
        first = bank(); second = bank('peer'); second['account_id'] = 'peer'; second['revision'] = 2
        result = self.dashboard([first, second], [decision(first, 'income', other_account_id='peer',
            other_external_id='peer', other_revision=1)])
        self.assertEqual(result['pending_count'], 2)
        self.assertTrue(result['movements'][0]['decision_changed'])

    def test_refund_reduces_expense_and_duplicate_does_not_count(self):
        purchase = bank('purchase', kind='CREDIT', direction='DEBIT')
        refund = bank('refund', amount='10', kind='CREDIT')
        duplicate = bank('duplicate', kind='CREDIT', direction='DEBIT')
        result = self.dashboard([purchase, refund, duplicate], [decision(purchase, 'expense'),
            decision(refund, 'refund'), decision(duplicate, 'duplicate', other_account_id='bank',
            other_external_id='purchase', other_revision=1)])
        self.assertEqual(result['currencies']['BRL']['expense'], '90.00')

    def test_money_uses_decimal_and_currency_is_never_mixed(self):
        first, second = bank('first', amount='.1'), bank('second', amount='.2')
        foreign = bank('usd', amount='50'); foreign['currency'] = 'USD'
        result = self.dashboard([first, second, foreign], [decision(r, 'income') for r in [first, second, foreign]])
        self.assertEqual(result['currencies']['BRL']['income'], '0.30')
        self.assertEqual(result['currencies']['USD']['income'], '50.00')

    def test_scope_cannot_mix_sandbox_and_production(self):
        production = bank(); production['data_scope'] = 'production'
        self.assertEqual(self.dashboard([production], [decision(production, 'income')])['currencies'], {})

    def test_recurring_forecast_is_not_duplicated_by_materialized_legacy(self):
        legacy = [dict(source='recorrencias', id='r', valor=50, tipo='receita', ativo=True,
                       dia_mes=25, data_inicio='2026-01-01'),
                  dict(source='transactions', id='future', valor=50, tipo='receita', data='2026-10-25',
                       parcel_group_id='rec_r_2026-10')]
        result = self.dashboard([], legacy=legacy)
        self.assertEqual(result['currencies']['BRL']['projected_income'], '50.00')
        self.assertEqual(result['currencies']['BRL']['income'], '0.00')

    def test_realized_occurrence_suppresses_just_that_projection(self):
        row = bank()
        legacy = [dict(source='recorrencias', id='r', valor=100, tipo='receita', ativo=True, dia_mes=25, data_inicio='2026-01-01')]
        result = self.dashboard([row], [decision(row, 'income', legacy_table='recorrencias',legacy_id='r',
                                               legacy_occurrence='2026-10-25')], legacy)
        self.assertEqual(result['currencies']['BRL']['projected_income'], '0.00')
        self.assertTrue(any(p['due'].startswith('2026-11') for p in result['projections']))

    def test_installments_not_synthesized_beyond_provider_records(self):
        row = bank('installment', kind='CREDIT', direction='DEBIT', amount='25')
        row['metadata'] = {'installmentNumber': 1, 'totalInstallments': 12}
        result = self.dashboard([row], [decision(row, 'expense')])
        self.assertEqual(result['projections'], [])
        self.assertEqual(result['currencies']['BRL']['expense'], '25.00')

    def test_provider_documents_are_used_transiently_only(self):
        synthetic = '00000000000'
        row = base.transaction(); row['paymentData'] = {
            key: {'documentNumber': {'value': synthetic, 'type': 'CPF'}} for key in ('payer','receiver')}
        result = normalized_transaction(row, 'account', {'type':'BANK','taxNumber':synthetic})
        self.assertEqual(result['metadata']['semantic_hint'], 'own_transfer')
        self.assertNotIn(synthetic, json.dumps(result))
        row['paymentData']['payer']['documentNumber']['value'] = '***'
        self.assertNotIn('semantic_hint', normalized_transaction(row,'account',{'type':'BANK','taxNumber':synthetic})['metadata'])


class ReleaseRouteTests(unittest.TestCase):
    def setUp(self):
        base.RouteTests.setUp(self)
        self.store.registered_item.return_value = {'id': base.CONSENT, 'client_user_id': 'server-binding'}

    def test_reconnect_checks_owner_binding_and_scopes_token(self):
        response = self.browser.post('/api/open-finance/items/item/connect-token', headers=self.headers, json={'consent':True})
        self.assertEqual(response.status_code, 200)
        self.client.connect_token.assert_called_once_with('server-binding','item')
        self.store.renew.assert_called_once_with(base.OWNER,'item','server-binding','sandbox')

    def test_meu_pluggy_item_without_binding_is_not_adopted(self):
        self.client.item.return_value['clientUserId'] = 'different-client-user'
        response = self.browser.post('/api/open-finance/items/item/connect-token', headers=self.headers, json={'consent':True})
        self.assertEqual(response.status_code, 403)
        self.client.connect_token.assert_not_called()

    def test_sandbox_cannot_bind_real_bank(self):
        self.client.item.return_value['connector']['isSandbox'] = False
        response = self.browser.post('/api/open-finance/items', headers=self.headers,
                                     json={'itemId':'item','consentId':base.CONSENT})
        self.assertEqual(response.status_code, 502)
        self.store.bind.assert_not_called()

    def test_production_requires_separate_release_approval(self):
        with patch.dict(os.environ, {'OPEN_FINANCE_MODE':'production'}):
            response = self.browser.get('/api/open-finance/inventory',headers=self.headers)
        self.assertEqual(response.status_code, 503)

    def test_production_cannot_activate_with_unprotected_legacy_dashboard(self):
        with patch.dict(os.environ, {'OPEN_FINANCE_MODE':'production','OPEN_FINANCE_RELEASE_APPROVED':'true'}):
            response = self.browser.get('/api/open-finance/inventory',headers=self.headers)
        self.assertEqual(response.status_code,503)

    def test_rate_limit_fails_closed(self):
        self.store.rate_limit.return_value = False
        response = self.browser.get('/api/open-finance/inventory',headers=self.headers)
        self.assertEqual(response.status_code, 429)
        self.store.inventory.assert_not_called()

    def test_reconcile_owner_from_verified_auth_not_body(self):
        self.store.decide.return_value = 'decision'
        response = self.browser.post('/api/open-finance/reconcile',headers=self.headers,json={
            'request_id':base.CONSENT,'account_id':'account','external_id':'tx','revision':1,
            'kind':'expense','reason':'Reviewed charge','owner_id':'victim','secret':'must-not-be-stored'})
        self.assertEqual(response.status_code, 200)
        owner, _, action = self.store.decide.call_args.args
        self.assertEqual(owner, base.OWNER)
        self.assertNotIn('secret',action); self.assertNotIn('owner_id',action)

    def test_malformed_json_returns_client_error(self):
        response = self.browser.post('/api/open-finance/connect-token',headers=self.headers,json=['invalid'])
        self.assertEqual(response.status_code,400)

    def test_cutover_closes_unscoped_legacy_api_and_redirects_root(self):
        from app import app
        with patch.dict(os.environ, {'OPEN_FINANCE_DASHBOARD':'true'}):
            client = app.test_client()
            response = client.get('/')
            self.assertEqual(response.status_code,302)
            self.assertEqual(response.headers['Location'],'/open-finance')
            self.assertEqual(client.get('/api/transactions').status_code,410)
            self.assertEqual(client.post('/api/recorrencias/process').status_code,410)
            self.assertEqual(client.get('/api/version').status_code,200)

    def test_login_csrf_is_not_bypassed_by_authorization_header(self):
        response = self.browser.post('/api/open-finance/session',base_url='https://localhost',
            headers={'Authorization':'Bearer invalid','Origin':'https://evil.test'},
            json={'email':'sandbox@example.test','password':'synthetic'})
        self.assertEqual(response.status_code,403)
        self.runtime.login.assert_not_called()


class ReleaseToolTests(unittest.TestCase):
    def test_snapshot_strips_unrelated_or_sensitive_fields(self):
        from scripts.assign_legacy_owner import snapshot
        result = snapshot('transactions',dict(id='id',valor=12,tipo='receita',data='2026-10-01',
            private_document='synthetic-document',api_key='synthetic-secret'))
        self.assertEqual(set(result),{'id','valor','tipo','data'})

    def test_synthetic_snapshot_dry_run_does_not_need_remote_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'fixture.json'
            path.write_text(json.dumps({'transactions':[{'id':'fixture','valor':1,'tipo':'receita','data':'2025-01-01'}]}))
            result = subprocess.run([sys.executable,'scripts/assign_legacy_owner.py','--owner',base.OWNER,
                '--fixture-json',str(path)],capture_output=True,text=True,check=True)
            self.assertEqual(json.loads(result.stdout),{'operation':'dry-run','records':1,'scope':'sandbox'})

    def test_bank_conflict_is_sanitized_with_conflict_status(self):
        from postgrest.exceptions import APIError
        db = Mock()
        db.rpc.return_value.execute.side_effect = APIError(dict(message='PRIVATE DETAILS',code='P0001',details=None,hint=None))
        with self.assertRaises(FinanceError) as error:
            SupabaseStore(db).decide(base.OWNER,base.CONSENT,{})
        self.assertEqual(error.exception.status,409)
        self.assertNotIn('PRIVATE',error.exception.message)


if __name__ == '__main__':
    unittest.main()
