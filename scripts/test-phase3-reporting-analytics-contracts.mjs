import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('--- PHASE 3 REPORTING & ANALYTICS CONTRACT VALIDATION ---');

const migrationPath = resolve('supabase/migrations/20260922_phase3_reporting_analytics_foundation.sql');
if (!existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Strict absence of noncanonical business_branches table references',
    test: () => !/business_branches/i.test(sql)
  },
  {
    name: '2. RPC get_tenant_booking_analytics exists with tenant/branch scoping',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_booking_analytics/i.test(sql) &&
                /p_tenant_id\s+UUID/i.test(sql) && /p_branch_id\s+UUID/i.test(sql)
  },
  {
    name: '3. Booking analytics strictly classifies price sums as ESTIMATED_REVENUE',
    test: () => /'financial_metric_classification',\s*'ESTIMATED_REVENUE'/i.test(sql) &&
                /'estimated_revenue',\s*v_estimated_revenue/i.test(sql)
  },
  {
    name: '4. Booking analytics computes completion, cancellation, and no-show funnel rates',
    test: () => /'completion_rate'/i.test(sql) && /'cancellation_rate'/i.test(sql) && /'no_show_rate'/i.test(sql)
  },
  {
    name: '5. Date range bounds enforced with maximum 366 days window',
    test: () => /p_end_date\s*-\s*p_start_date\s*\)\s*>\s*366/i.test(sql)
  },
  {
    name: '6. RPC get_tenant_staff_performance_analytics exists with staff metrics',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_staff_performance_analytics/i.test(sql) &&
                /'staff_performance'/i.test(sql) && /'total_duration_minutes'/i.test(sql)
  },
  {
    name: '7. Staff performance classifies revenue as ESTIMATED_REVENUE',
    test: () => (sql.match(/'financial_metric_classification',\s*'ESTIMATED_REVENUE'/g) || []).length >= 4
  },
  {
    name: '8. RPC get_tenant_service_performance_analytics exists with popularity breakdown',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_service_performance_analytics/i.test(sql) &&
                /'service_performance'/i.test(sql) && /'total_bookings'/i.test(sql)
  },
  {
    name: '9. RPC get_tenant_branch_comparison_analytics exists with comparative multi-branch breakdown',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_branch_comparison_analytics/i.test(sql) &&
                /'branch_comparison'/i.test(sql) && /'is_primary'/i.test(sql)
  },
  {
    name: '10. RPC get_tenant_customer_retention_analytics exists with first-time vs repeat rates',
    test: () => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_tenant_customer_retention_analytics/i.test(sql) &&
                /'first_time_customers'/i.test(sql) && /'repeat_customers'/i.test(sql) && /'repeat_booking_rate'/i.test(sql)
  },
  {
    name: '11. Direct execution of all analytics RPCs REVOKED from PUBLIC and anon',
    test: () => /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_booking_analytics.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_staff_performance_analytics.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_service_performance_analytics.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_branch_comparison_analytics.*FROM\s+PUBLIC,\s*anon;/i.test(sql) &&
                /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_customer_retention_analytics.*FROM\s+PUBLIC,\s*anon;/i.test(sql)
  },
  {
    name: '12. Execution of analytics RPCs GRANTED to authenticated and service_role',
    test: () => /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_booking_analytics.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_staff_performance_analytics.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_service_performance_analytics.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_branch_comparison_analytics.*TO\s+authenticated,\s*service_role;/i.test(sql) &&
                /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_tenant_customer_retention_analytics.*TO\s+authenticated,\s*service_role;/i.test(sql)
  },
  {
    name: '13. All RPCs enforce SECURITY DEFINER and search_path isolation',
    test: () => (sql.match(/SECURITY\s+DEFINER/g) || []).length >= 5 &&
                (sql.match(/SET\s+search_path\s*=\s*pg_catalog,\s*public/g) || []).length >= 5
  },
  {
    name: '14. Strict absence of settled/collected/accounting revenue misclassifications',
    test: () => !/collected_revenue/i.test(sql) && !/settled_revenue/i.test(sql) && !/accounting_revenue/i.test(sql)
  }
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  try {
    if (t.test()) {
      console.log(`PASS: ${t.name}`);
      passed++;
    } else {
      console.error(`FAIL: ${t.name}`);
      failed++;
    }
  } catch (err) {
    console.error(`ERROR: ${t.name}:`, err.message);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${tests.length} total.`);
if (failed > 0) {
  process.exit(1);
}
