"""Read-only local configuration check. Never prints credential values or connects."""
import json
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).parents[1]))
from open_finance import key_kind

checks = {name:bool(os.getenv(name)) for name in ('SUPABASE_URL','SUPABASE_KEY','PLUGGY_CLIENT_ID','PLUGGY_CLIENT_SECRET','CRON_SECRET','OPEN_FINANCE_WEBHOOK_TOKEN')}
role = key_kind(os.getenv('SUPABASE_KEY',''))
checks['privileged_staging_key'] = role in ('service_role','secret') or key_kind(os.getenv('SUPABASE_SERVICE_ROLE_KEY','')) in ('service_role','secret')
checks['production_still_disabled'] = os.getenv('PLUGGY_ENABLED','false')=='false'
print(json.dumps({'credential_kind':role,'checks':checks,'live_pluggy_validated':False,
    'release_status':'requires-sandbox-and-human-review'},sort_keys=True))
# Presence alone can never certify a live banking release.
raise SystemExit(0 if all(checks.values()) else 2)
