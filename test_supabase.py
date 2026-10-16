"""Opt-in read-only Supabase smoke. Never prints credentials or financial rows."""
import os


def main():
    if os.getenv('FINANCES_SUPABASE_READONLY_SMOKE') != 'true':
        print('SKIPPED: Supabase live smoke requires explicit read-only consent')
        return 0
    try:
        from open_finance import Runtime
        store = Runtime().store()
        store.db.table('open_finance_transactions').select('external_id').limit(1).execute()
    except Exception:
        print('FAILED: Supabase read-only smoke; verify configuration without printing values')
        return 1
    print('PASSED: Supabase read-only smoke; no records or credentials logged')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
