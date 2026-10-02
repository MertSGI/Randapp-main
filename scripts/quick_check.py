import re

sql = open('supabase/migrations/20261004_phase7_node1_verified_reviews_foundation.sql').read()

print('Migration length:', len(sql))
checks = {
    'reviews table': 'CREATE TABLE IF NOT EXISTS public.reviews' in sql,
    'SECURITY DEFINER': 'SECURITY DEFINER' in sql,
    'search_path': 'search_path = pg_catalog, public' in sql,
    'pg_advisory_xact_lock': 'pg_advisory_xact_lock' in sql,
    'CROSS_TENANT_VIOLATION': 'CROSS_TENANT_VIOLATION' in sql,
    'completed gate': "status = 'completed'" in sql or "status <> 'completed'" in sql,
    'idempotent_replay': 'idempotent_replay' in sql,
    'review_idempotency_keys': 'review_idempotency_keys' in sql,
    'audit_events': 'INSERT INTO public.audit_events' in sql,
    'REVOKE': 'REVOKE ALL ON TABLE' in sql,
    'GRANT service_role': 'TO service_role' in sql,
    'RLS': 'ENABLE ROW LEVEL SECURITY' in sql,
    'tenant_owner': 'tenant_owner' in sql,
    'timezone utc': "timezone('utc'::text, now())" in sql
}

for k, v in checks.items():
    print(k + ': ' + str(v))