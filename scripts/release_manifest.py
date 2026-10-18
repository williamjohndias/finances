"""Reproducible checksums for reviewed release artifacts; never reads credentials."""
import argparse
import hashlib
import json
from pathlib import Path

root = Path(__file__).parents[1]
files = ['requirements.txt','migrations/001_open_finance_staging.sql','migrations/002_open_finance_sync.sql',
         'migrations/003_open_finance_release.sql','frontend/package-lock.json',
         'templates/static/vendor/pluggy-connect-2.14.2.js','templates/static/vendor/THIRD_PARTY_NOTICES.txt']
manifest = {'version':'2.0.0-rc.1','base_commit':'45b539e63c2fa2d25084e564e72b370051050dd5',
    'approval_required':True,'production_activated':False,'live_pluggy_validation':'pending',
    'sha256':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in files}}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check',action='store_true')
args = parser.parse_args()
target = root/'release/manifest.json'
if args.check:
    if not target.exists() or json.loads(target.read_text()) != manifest:
        raise SystemExit('Release artifacts changed; regenerate and review manifest')
    print('Release artifact checksums verified; live homologation remains pending')
else:
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    print('Release candidate manifest written; no publication or activation performed')
