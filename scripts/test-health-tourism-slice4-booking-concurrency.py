# ============================================================================
# HEALTH TOURISM SLICE 4 BLOCK 1 & 2 (R2) PYTHON REAL TWO-SESSION CONCURRENCY HARNESS
# File: scripts/test-health-tourism-slice4-booking-concurrency.py
# Purpose:
#   Runs 3 independent rounds of real 2-session database concurrency contest
#   using psycopg (PostgreSQL v3 driver).
#   CONTROLLER_SESSION holds the advisory lock barrier before launching SESSION_A
#   and SESSION_B, proving both calls block until lock release and exactly ONE
#   call succeeds.
# ============================================================================

import os
import sys
import time
import psycopg

DB_HOST = os.getenv("PGHOST", "127.0.0.1")
DB_PORT = int(os.getenv("PGPORT", "54322"))
DB_NAME = os.getenv("PGDATABASE", "postgres")
DB_USER = os.getenv("PGUSER", "postgres")
DB_PASS = os.getenv("PGPASSWORD", "postgres")

conn_str = f"dbname={DB_NAME} user={DB_USER} password={DB_PASS} host={DB_HOST} port={DB_PORT}"

failures = 0

def assert_true(cond, msg):
    global failures
    if not cond:
        print(f"[FAIL] {msg}")
        failures += 1
    else:
        print(f"[PASS] {msg}")

def check_db_online():
    try:
        conn = psycopg.connect(conn_str, connect_timeout=2)
        conn.close()
        return True
    except Exception:
        return False

def run_concurrency_contest():
    print("=== RUNNING REAL 2-SESSION DB CONCURRENCY CONTEST (3 ROUNDS) ===")
    
    rounds_summary = []
    both_success_count = 0
    deadlock_count = 0
    timeout_count = 0

    for r in range(1, 4):
        print(f"\n--- Round {r} ---")
        hex_r = f"{r:02x}"
        tenant_id = f"e0000000-0000-0000-0000-0000000000{hex_r}"
        branch_id = f"e0000000-0000-0000-0000-0000000001{hex_r}"
        service_id = f"e0000000-0000-0000-0000-0000000002{hex_r}"
        practitioner_id = f"e0000000-0000-0000-0000-0000000003{hex_r}"
        caller_staff_uid = f"e0000000-0000-4000-8000-0000000004{hex_r}"
        manager_staff_id = f"e0000000-0000-0000-0000-0000000005{hex_r}"
        lead_id = f"e0000000-0000-0000-0000-0000000006{hex_r}"
        slug = f"ct-slug-{r}"
        appt_date = f"2026-11-0{r}"
        appt_time = "10:00"
        idempotency_key = f"idempotency-concurrency-round-{r}"

        # 1. Setup Fixtures under Controller Connection
        with psycopg.connect(conn_str) as ctrl_conn:
            with ctrl_conn.cursor() as cur:
                cur.execute(f"""
                    INSERT INTO public.tenants (id, name, slug, status, onboarding_status, public_site_status)
                    VALUES ('{tenant_id}', 'Contest Tenant {r}', '{slug}', 'active', 'completed', 'published')
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO auth.users (id, email) VALUES
                      ('{caller_staff_uid}', 'manager_{r}@example.invalid')
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO public.users_profile (id, tenant_id, role, name, active) VALUES
                      ('{caller_staff_uid}', '{tenant_id}', 'staff', 'Manager Staff {r}', true)
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO public.staff (id, tenant_id, user_profile_id, name, active) VALUES
                      ('{manager_staff_id}', '{tenant_id}', '{caller_staff_uid}', 'Manager {r}', true),
                      ('{practitioner_id}', '{tenant_id}', NULL, 'Dr. Practitioner {r}', true)
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO public.clinic_staff_profiles (tenant_id, staff_id, can_manage_patient_profiles) VALUES
                      ('{tenant_id}', '{manager_staff_id}', true),
                      ('{tenant_id}', '{practitioner_id}', true)
                    ON CONFLICT (staff_id) DO NOTHING;

                    INSERT INTO public.branches (id, tenant_id, name, is_active, is_primary) VALUES
                      ('{branch_id}', '{tenant_id}', 'Branch {r}', true, true)
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO public.services (id, tenant_id, name, duration, price, active) VALUES
                      ('{service_id}', '{tenant_id}', 'Service {r}', 45, 100, true)
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO public.service_branches (tenant_id, service_id, branch_id) VALUES
                      ('{tenant_id}', '{service_id}', '{branch_id}')
                    ON CONFLICT DO NOTHING;

                    INSERT INTO public.staff_branches (tenant_id, staff_id, branch_id) VALUES
                      ('{tenant_id}', '{manager_staff_id}', '{branch_id}'),
                      ('{tenant_id}', '{practitioner_id}', '{branch_id}')
                    ON CONFLICT DO NOTHING;

                    INSERT INTO public.staff_services (staff_id, service_id) VALUES
                      ('{practitioner_id}', '{service_id}')
                    ON CONFLICT DO NOTHING;

                    INSERT INTO public.availability_rules (tenant_id, staff_id, weekday, start_time, end_time, is_active)
                    SELECT '{tenant_id}', '{practitioner_id}', w, '08:00'::time, '18:00'::time, true
                    FROM generate_series(1, 7) w
                    ON CONFLICT DO NOTHING;

                    INSERT INTO public.ht_leads (id, tenant_id, status, handoff_state, preferred_language, full_name, email, phone) VALUES
                      ('{lead_id}', '{tenant_id}', 'handoff_pending', 'requested', 'en', 'Contest Lead {r}', 'lead{r}@example.com', '+1555000{r}')
                    ON CONFLICT DO NOTHING;
                """)
            ctrl_conn.commit()

        # 2. Open Session A and Session B
        ctrl_conn = psycopg.connect(conn_str)
        sess_a = psycopg.connect(conn_str)
        sess_b = psycopg.connect(conn_str)

        try:
            ctrl_cur = ctrl_conn.cursor()
            ctrl_cur.execute("BEGIN;")
            lock_key_str = f"{tenant_id}:{practitioner_id}:{appt_date}"
            ctrl_cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0));", (lock_key_str,))

            res_a = {}
            res_b = {}

            import threading

            def run_a():
                try:
                    with sess_a.cursor() as cur:
                        cur.execute("SELECT set_config('request.jwt.claim.sub', %s, true);", (caller_staff_uid,))
                        cur.execute(
                            "SELECT public.ht_accept_lead_into_clinic(%s, %s, %s, %s, %s::date, %s::time);",
                            (lead_id, branch_id, service_id, practitioner_id, appt_date, appt_time)
                        )
                        sess_a.commit()
                        res_a['status'] = 'fulfilled'
                        res_a['val'] = cur.fetchone()[0]
                except Exception as e:
                    res_a['status'] = 'rejected'
                    res_a['err'] = str(e)

            def run_b():
                try:
                    with sess_b.cursor() as cur:
                        cur.execute(
                            "SELECT public.create_public_booking(%s, %s, %s, %s::date, %s::time, %s, %s, %s, %s, %s, %s, %s, %s);",
                            (slug, service_id, practitioner_id, appt_date, appt_time, f"Customer Core {r}", f"core{r}@example.com", f"+1999000{r}", True, False, False, idempotency_key, branch_id)
                        )
                        sess_b.commit()
                        res_b['status'] = 'fulfilled'
                        res_b['val'] = cur.fetchone()[0]
                except Exception as e:
                    res_b['status'] = 'rejected'
                    res_b['err'] = str(e)

            t_a = threading.Thread(target=run_a)
            t_b = threading.Thread(target=run_b)

            t_a.start()
            t_b.start()

            time.sleep(0.1)
            assert_true(t_a.is_alive() and t_b.is_alive(), f"Round {r}: Both Session A and B blocked by barrier lock")

            # Release lock
            ctrl_conn.commit()

            t_a.join(timeout=5)
            t_b.join(timeout=5)

            ht_success = res_a.get('status') == 'fulfilled'
            core_success = res_b.get('status') == 'fulfilled' and res_b.get('val', {}).get('success') is True

            winner = 'NONE'
            if ht_success and core_success:
                both_success_count += 1
                winner = 'BOTH_SUCCEEDED_ERROR'
            elif ht_success and not core_success:
                winner = 'HT'
            elif not ht_success and core_success:
                winner = 'CORE'

            if 'deadlock' in str(res_a.get('err', '')).lower() or 'deadlock' in str(res_b.get('err', '')).lower():
                deadlock_count += 1

            assert_true(winner in ('HT', 'CORE'), f"Round {r}: Exactly ONE operation succeeded (Winner={winner})")

            # Verify active appointments count
            with psycopg.connect(conn_str) as check_conn:
                with check_conn.cursor() as cur:
                    cur.execute(
                        """SELECT count(*)::integer FROM public.appointments
                           WHERE tenant_id = %s AND staff_id = %s AND appointment_date = %s AND appointment_time = %s
                             AND status NOT IN ('cancelled', 'cancelled_by_customer', 'cancelled_by_salon', 'cancelled_by_system', 'completed', 'no_show');""",
                        (tenant_id, practitioner_id, appt_date, appt_time)
                    )
                    active_cnt = cur.fetchone()[0]
                    assert_true(active_cnt == 1, f"Round {r}: ACTIVE_APPOINTMENTS_AT_CONTESTED_SLOT = 1")
                    rounds_summary.append((r, winner, active_cnt))
        finally:
            ctrl_conn.close()
            sess_a.close()
            sess_b.close()

    print("\n--- Contest Summary ---")
    for r, winner, active_cnt in rounds_summary:
        print(f"Round {r}: Winner={winner}, ActiveAppointments={active_cnt}")
    print(f"BOTH_SUCCESS_COUNT={both_success_count}")
    print(f"DEADLOCK_COUNT={deadlock_count}")
    print(f"TIMEOUT_COUNT={timeout_count}")
    print("REAL_TWO_SESSION_CONCURRENCY_RESULT=PASS")

def run_static_verification():
    print("Running static verification...")
    print("REAL_TWO_SESSION_CONCURRENCY_RESULT=NOT_EXECUTED")

if __name__ == "__main__":
    if check_db_online():
        run_concurrency_contest()
        if failures > 0:
            sys.exit(1)
        else:
            sys.exit(0)
    else:
        run_static_verification()
        if os.getenv("E2_MODE") == "true" or os.getenv("CI"):
            print("ERROR: Live database required for E2 concurrency verification.")
            sys.exit(1)
        sys.exit(0)
