"""Reviewed cutover snapshot. Reads legacy tables; never updates or deletes them.

Dry-run by default. Production apply requires an explicit external change record.
No credentials, record IDs, financial values or payloads are printed.
"""
import argparse
import json
from pathlib import Path
import sys
from uuid import UUID

sys.path.insert(0,str(Path(__file__).parents[1]))
from open_finance import Runtime

FIELDS = {
    'transactions': ('id','tipo','valor','data','parcelado','parcela_atual','total_parcelas','parcel_group_id'),
    'abatimentos': ('id','valor','data','tipo_cartao'),
    'recorrencias': ('id','tipo','valor','dia_mes','data_inicio','ativo'),
}


def snapshot(source, row):
    if source not in FIELDS or not row.get('id') or row.get('valor') is None:
        raise ValueError('Invalid legacy fixture')
    return {key:row[key] for key in FIELDS[source] if key in row}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--owner',required=True,type=UUID)
    parser.add_argument('--scope',choices=('sandbox','production'),default='sandbox')
    parser.add_argument('--fixture-json',type=Path,help='Synthetic sandbox records by source; never real financial data')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--approved-change-id',help='External approval reference, not a secret')
    args = parser.parse_args()
    if args.scope=='sandbox' and not args.fixture_json:
        parser.error('Sandbox requires synthetic fixture JSON; remote legacy data is never relabeled sandbox')
    if args.scope=='production' and (args.fixture_json or not args.approved_change_id):
        parser.error('Production requires an approved change record and the existing legacy database')
    fixtures = json.loads(args.fixture_json.read_text()) if args.fixture_json else None
    store = None
    if args.apply or fixtures is None:
        store = Runtime().store()
    count = 0
    for source in FIELDS:
        if fixtures is not None:
            batches = [fixtures.get(source,[])]
        else:
            # Explicit pages avoid PostgREST's default 1000-row result ceiling.
            batches = None
        offset = 0
        while True:
            rows = batches[0] if batches is not None else store.db.table(source).select(','.join(FIELDS[source])).order('id').range(offset,offset+499).execute().data
            for row in rows:
                data = {'source':source,'legacy_id':str(row['id']),'owner_id':str(args.owner),
                        'data_scope':args.scope,'snapshot':snapshot(source,row)}
                if args.apply:
                    existing = store.db.table('of_legacy_ownership').select('owner_id,data_scope,snapshot').eq(
                        'source',source).eq('legacy_id',str(row['id'])).execute().data
                    if existing and (existing[0]['owner_id']!=str(args.owner) or existing[0]['data_scope']!=args.scope
                                     or existing[0]['snapshot']!=data['snapshot']):
                        raise ValueError('Ownership or snapshot conflict; no automatic reassignment')
                    if not existing:
                        store.db.table('of_legacy_ownership').insert(data).execute()
                count += 1
            if batches is not None or len(rows)<500:
                break
            offset += 500
    print(json.dumps({'operation':'applied' if args.apply else 'dry-run','records':count,'scope':args.scope}))


if __name__=='__main__':
    try:
        main()
    except Exception:
        # SDK exceptions may contain remote payloads: report a fixed message only.
        raise SystemExit('Legacy snapshot failed; verify configuration, approval and ownership without printing data') from None
