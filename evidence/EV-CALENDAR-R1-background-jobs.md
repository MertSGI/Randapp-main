---
evidence_id: EV-CALENDAR-R1
claim_type: CLAIM_ONLY
program_id: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
authority_id: LARI-PROGRAM-V2-PHASE3-FINAL-CORRECTIONS-AND-PHASE4-INTEGRATION-20260911-01
base_canonical_sha: bda129f708b95c9bb44171120c94bfd985dd6a55
branch_name: aos/phase3-background-job-calendar-foundation-r1
commit_sha: b615f2885af1081193a7374ce9e25877d8ec52e4
target_phase: PHASE_3_CALENDAR_BACKGROUND_JOBS
date: 2026-09-11
status: COMPLETED_AND_PUSHED
production_mode: NO_GO
---

# EV-CALENDAR-R1: Calendar & Background Jobs Foundation (R1 Worker Lifecycle and Appointment Tenant Integrity)

## 1. Summary of Corrections
- Added appointment foreign key and strict tenant validation in `public.calendar_sync_queue`:
  - `appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE`.
  - `enqueue_calendar_sync` verifies appointment exists and belongs to the exact tenant (`WHERE id = p_appointment_id AND tenant_id = p_tenant_id`), failing closed on mismatch (`APPOINTMENT_TENANT_MISMATCH`).
- Implemented full bounded background job worker lifecycle:
  - `enqueue_background_job`: Idempotent enqueue with tenant and job-type deduplication.
  - `claim_background_job_batch`: Atomic lease locking with `FOR UPDATE SKIP LOCKED`, bounded batch sizes, bounded lease durations, and automatic reclamation of expired leases.
  - `complete_background_job`: Marks job completed with structured JSONB result.
  - `fail_background_job`: Distinguishes `failed_retryable` with backoff delay from `dead_letter` when `max_attempts` is exhausted.
  - `cancel_background_job`: Safely cancels queued or retryable jobs.
- Maintained:
  - Zero live Google OAuth / external network calendars (deterministic test provider only).
  - Strict security definer and search path isolation.
  - Full row-level security with table access revoked from all browser roles.

## 2. Verification Evidence
- Contract test runner: `scripts/test-phase3-background-job-calendar-contracts.mjs`
- Test execution output: 12/12 contract tests passed.
- Git Commit: `b615f2885af1081193a7374ce9e25877d8ec52e4`
- Remote Branch: `origin/aos/phase3-background-job-calendar-foundation-r1`
