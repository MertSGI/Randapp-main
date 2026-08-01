-- =========================================================================
-- STAGE H1C — USAGE_COUNTERS INVARIANT CONSTRAINT
-- Migration: 20260815_h1c_usage_counters_invariant.sql
-- Description: Reconciles any existing usage_counters rows and adds a strict
--              database-level CHECK constraint enforcing usage_count = used_count.
--              Establishes used_count as canonical consumed quota counter with
--              usage_count as a strict read-compatibility mirror.
-- Governance: Forward-only migration 40. Payments/iyzico disabled. Production NO-GO.
-- =========================================================================

-- 1. Reconcile any existing divergent rows safely
UPDATE public.usage_counters
SET usage_count = used_count
WHERE usage_count IS DISTINCT FROM used_count;

-- 2. Drop existing constraint if re-applied
ALTER TABLE public.usage_counters
    DROP CONSTRAINT IF EXISTS chk_usage_counters_mirror_equality;

-- 3. Add strict database-level invariant constraint
ALTER TABLE public.usage_counters
    ADD CONSTRAINT chk_usage_counters_mirror_equality
    CHECK (usage_count = used_count);

-- 4. Document column contracts
COMMENT ON COLUMN public.usage_counters.used_count IS 'Canonical consumed resource quota counter used for business decision evaluation.';
COMMENT ON COLUMN public.usage_counters.usage_count IS 'Compatibility mirror counter strictly constrained to equal used_count via chk_usage_counters_mirror_equality.';
