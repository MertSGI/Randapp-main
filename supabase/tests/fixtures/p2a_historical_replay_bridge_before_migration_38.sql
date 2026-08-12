-- p2a_historical_replay_bridge_before_migration_38.sql
-- DISPOSABLE TEST-ONLY HISTORICAL REPLAY COMPATIBILITY BRIDGE FIXTURE.
-- THIS IS NOT A PRODUCTION MIGRATION AND MUST NEVER BE DEPLOYED TO STAGING OR PRODUCTION.
-- Purpose: Reproduces the minimum historical pre-existing state (canonical Melis tenant)
-- required by frozen historical migration 38 (20260813_h1c_commercial_eligibility_and_quota_enforcement.sql)
-- during disposable clean database replay.

INSERT INTO public.tenants (
    id,
    slug,
    name,
    status
) VALUES (
    'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
    'melis-guzellik',
    'Melis Güzellik Salonu',
    'active'
) ON CONFLICT (id) DO NOTHING;
