"""Bank-first read model. Legacy records are never mutated or added twice."""
from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo


def local_date(value):
    if len(value) == 10:
        return date.fromisoformat(value)
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ZoneInfo('America/Sao_Paulo')).date()


def amount(value):
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError('Invalid financial amount')
    return abs(result)


def build_dashboard(data, month, scope, today=None):
    today = today or datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    year, number = map(int, month.split('-'))
    date(year, number, 1)
    decisions = {(r['account_id'], r['external_id']): r for r in data.get('decisions', [])}
    transactions = {(r['account_id'], r['external_id']): r for r in data.get('transactions', [])}
    buckets, movements, matched, occurrences = {}, [], set(), set()

    def totals(currency):
        return buckets.setdefault(currency, {key: Decimal(0) for key in
            ('income', 'expense', 'invoice_paid', 'projected_income', 'projected_expense')})

    for key, row in transactions.items():
        if row.get('data_scope') != scope:
            continue
        decision = decisions.get(key)
        valid = decision and decision['bank_revision'] == row['revision']
        if valid and decision.get('other_account_id'):
            other = transactions.get((decision['other_account_id'], decision['other_external_id']))
            valid = bool(other and other.get('data_scope') == scope and other['revision'] == decision['other_revision'])
        confirmed = row['bank_status'] == 'POSTED' and local_date(row['occurred_at']) <= today
        kind = decision['kind'] if valid and confirmed else 'pending'
        if valid and confirmed and decision.get('legacy_id'):
            matched.add((decision['legacy_table'], decision['legacy_id']))
            if decision.get('legacy_occurrence'):
                occurrences.add((decision['legacy_id'], decision['legacy_occurrence']))
        in_month = local_date(row['occurred_at']).strftime('%Y-%m') == month
        if in_month:
            item = {k: row[k] for k in ('account_id','external_id','amount','currency','occurred_at',
                                        'direction','bank_status','revision','account_kind','category_id')}
            item.update(kind=kind, origin='Pluggy', needs_review=kind == 'pending',
                        decision_changed=bool(decision and not valid), metadata=row.get('metadata') or {})
            movements.append(item)
            if kind in ('income', 'expense'):
                totals(row['currency'])[kind] += amount(row['amount'])
            elif kind == 'refund':
                totals(row['currency'])['expense'] -= amount(row['amount'])
            elif kind == 'invoice_payment' and row['account_kind'] == 'BANK' and row['direction'] == 'DEBIT':
                totals(row['currency'])['invoice_paid'] += amount(row['amount'])

    forecasts = []
    legacy = data.get('legacy', [])
    materialized = {row.get('parcel_group_id') for row in legacy if row['source'] == 'transactions'}
    for row in legacy:
        if row['source'] == 'transactions' and row.get('data'):
            due = date.fromisoformat(row['data'])
            if due > today and (row['source'], row['id']) not in matched:
                forecasts.append(dict(id=row['id'], due=due.isoformat(), amount=row['valor'],
                    kind='income' if row['tipo'] == 'receita' else 'expense', source='historical_projection', currency='BRL'))
        if row['source'] != 'recorrencias' or not row.get('ativo'):
            continue
        for offset in range(4):
            y = today.year + (today.month - 1 + offset) // 12
            m = (today.month - 1 + offset) % 12 + 1
            due = date(y, m, min(int(row['dia_mes']), monthrange(y, m)[1]))
            if due <= today or due > today + timedelta(days=90) or due < date.fromisoformat(row['data_inicio']):
                continue
            if (row['id'], due.isoformat()) in occurrences or f"rec_{row['id']}_{due:%Y-%m}" in materialized:
                continue
            forecasts.append(dict(id=row['id'], due=due.isoformat(), amount=row['valor'],
                kind='income' if row['tipo'] == 'receita' else 'expense', source='recurrence_estimate', currency='BRL'))
    # Only reported future bank records, never invent the rest of an installment plan.
    for row in transactions.values():
        if row.get('data_scope') == scope and local_date(row['occurred_at']) > today:
            forecasts.append(dict(id=row['external_id'], due=local_date(row['occurred_at']).isoformat(),
                amount=row['amount'], kind='pending', source='bank_future_unreconciled', currency=row['currency']))
    for forecast in forecasts:
        if forecast['due'].startswith(month) and forecast['kind'] in ('income', 'expense'):
            totals(forecast['currency'])['projected_' + forecast['kind']] += amount(forecast['amount'])
        forecast['amount'] = str(amount(forecast['amount']))
    for values in buckets.values():
        values['net_realized'] = values['income'] - values['expense']
        for key, value in values.items():
            values[key] = str(value.quantize(Decimal('.01')))
    return dict(month=month, data_scope=scope, sandbox=scope == 'sandbox', currencies=buckets,
        movements=movements, projections=forecasts, pending_count=sum(r['needs_review'] for r in movements),
        historical_count=len(legacy), historical_not_added=True, legacy=legacy,
        accounts=data.get('accounts', []), source='Pluggy / Open Finance', decisions=data.get('audit', []),
        rules=data.get('rules', []), review_options=[{k: r.get(k) for k in
            ('account_id','external_id','revision','amount','currency','direction','occurred_at','account_kind','bank_status')}
            for r in transactions.values() if r.get('data_scope') == scope])
