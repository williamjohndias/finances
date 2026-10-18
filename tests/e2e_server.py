"""Local HTTPS-only browser fixture. All financial/provider/auth data is synthetic."""
import copy
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import uuid4

if os.getenv('FINANCES_E2E_TEST_SERVER') != '1':
    raise SystemExit('Test fixture requires an explicit local test flag')
for name in ('SUPABASE_URL','SUPABASE_KEY','SUPABASE_SERVICE_ROLE_KEY','PLUGGY_CLIENT_ID','PLUGGY_CLIENT_SECRET'):
    os.environ.pop(name, None)
sys.path.insert(0, str(Path(__file__).parents[1]))
from flask import Flask
from open_finance import FinanceError, register_open_finance

ROOT = Path(__file__).parents[1]
OWNER = '11111111-1111-1111-1111-111111111111'
CONSENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
JOB = {'id':'sandbox-item','lease':'synthetic-lease','client_user_id':'browser-binding','owner_id':OWNER}


class Store:
    def __init__(self):
        self.bound = False; self.queued = False; self.rows = {}; self.decisions = {}; self.audit = []
        self._consent = {'id':CONSENT,'client_user_id':'browser-binding', 'revoked_at':None,
                        'expires_at':(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()}
    def rate_limit(self, bucket, limit): return True
    def new_consent(self, owner): return self._consent
    def consent(self, owner, consent_id): return self._consent
    def bind(self, owner, consent_id, item, scope): self.bound = True
    def registered_item(self, owner, item_id):
        if not self.bound: raise FinanceError(404, 'Item unavailable')
        return self._consent
    def renew(self, *args): pass
    def revoke(self, owner, consent_id): self._consent['revoked_at'] = datetime.now(timezone.utc).isoformat()
    def inventory(self, owner):
        return {'items':[dict(id='sandbox-item',consent_id=CONSENT,connector='Synthetic Nubank',
            status='synced' if self.rows else 'queued',provider_status='UPDATED',data_scope='sandbox',last_synced_at=None)] if self.bound else [],
            'consents':[self._consent], 'accounts':[], 'transactions':[]}
    def enqueue(self, owner): self.queued = True
    def claim(self):
        if not self.queued: return None
        self.queued = False; return JOB
    def item_status(self, *args): pass
    def verify_scope(self, *args): pass
    def deletions(self, job): return []
    def account(self, job, account): return {'cursor':None,'last_synced_at':None}
    def page(self, job, account, rows, cursor):
        for row in rows:
            self.rows[(account,row['external_id'])] = dict(row,account_id=account,revision=1,
                data_scope='sandbox',account_kind='CREDIT' if account == 'card' else 'BANK',
                category_id=row.get('metadata',{}).get('category_id'))
    def auto_review(self, job):
        for key,row in self.rows.items():
            if row.get('metadata',{}).get('semantic_hint') == 'card_purchase' and key not in self.decisions:
                self.decisions[key] = dict(account_id=key[0],external_id=key[1],bank_revision=1,kind='expense')
    def finish(self, *args, **kwargs): pass
    def review_data(self, owner):
        return dict(transactions=list(self.rows.values()),decisions=list(self.decisions.values()),legacy=[],rules=[],audit=self.audit,
            accounts=[dict(id='bank',kind='BANK',balance=1000,currency='BRL',data_scope='sandbox',observed_at='2025-01-10T12:00:00Z')])
    def decide(self, owner, request_id, action):
        key = (action['account_id'],action['external_id'])
        self.decisions[key] = dict(account_id=key[0],external_id=key[1],bank_revision=action['revision'],kind=action['kind'])
        self.audit.append(dict(id=request_id,action=action,created_at='2025-01-10T12:00:00Z'))
        return request_id


class Provider:
    def close(self): pass
    def sandbox_connectors(self): return [2]
    def connect_token(self, *args): return 'synthetic-short-lived-connect-token'
    def item(self, item_id): return dict(id='sandbox-item',clientUserId='browser-binding',status='UPDATED',connector={'name':'Synthetic Nubank','isSandbox':True,'id':2})
    def accounts(self, item_id): return [dict(id=key,itemId=item_id,type=kind,currencyCode='BRL',balance=1000)
        for key,kind in [('bank','BANK'),('card','CREDIT')]]
    def transaction_page(self, account, after):
        row = dict(id='salary' if account=='bank' else 'purchase',accountId=account,
            amount=1000 if account=='bank' else 25,currencyCode='BRL',date='2025-01-10T12:00:00Z',
            status='POSTED',type='CREDIT' if account=='bank' else 'DEBIT',categoryId='salary-category')
        if account=='card': row['creditCardMetadata']={'paymentType':'SINGLE'}
        return [row],None


store = Store()
class Runtime:
    def store(self): return store
    def user(self, token):
        if token != 'synthetic-user-token': raise FinanceError(401,'Authentication required')
        return OWNER
    def login(self, email, password):
        if email != 'sandbox@example.test' or password != 'synthetic-password': raise FinanceError(401,'Authentication failed')
        return 'synthetic-user-token'

app = Flask(__name__,template_folder=str(ROOT/'templates'),static_folder=str(ROOT/'templates/static'))
register_open_finance(app,Provider,Runtime)
with tempfile.TemporaryDirectory(prefix='finances-e2e-tls-') as directory:
    cert,key = str(Path(directory)/'cert.pem'),str(Path(directory)/'key.pem')
    subprocess.run(['openssl','req','-x509','-nodes','-newkey','rsa:2048','-subj','/CN=localhost',
        '-days','1','-keyout',key,'-out',cert],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    app.run(host='127.0.0.1',port=5443,ssl_context=(cert,key),use_reloader=False)
