import fs from 'fs';
import path from 'path';

console.log('=== STAGE H1D SUPER ADMIN COMMERCIAL UI SECURITY & INVARIANTS QA ===');

function check(title, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${title}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${title} — ${err.message}`);
    process.exit(1);
  }
}

check('1. Route authorization for /super-admin/commercial requires super_admin role', () => {
  const appContent = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
  if (!appContent.includes('path="/super-admin/commercial"') || !appContent.includes('allowedRoles={[\'super_admin\']}')) {
    throw new Error('Route /super-admin/commercial is not protected with super_admin role');
  }
});

check('2. SuperAdminLayout contains Ticari Yönetim & Lisans navigation link', () => {
  const layoutContent = fs.readFileSync(path.join(process.cwd(), 'components/layouts/SuperAdminLayout.tsx'), 'utf8');
  if (!layoutContent.includes('path: \'/super-admin/commercial\'') || !layoutContent.includes('Ticari Yönetim & Lisans')) {
    throw new Error('SuperAdminLayout missing commercial management nav link');
  }
});

check('3. superAdminCommercialAdapter uses RPCs exclusively without direct table writes', () => {
  const adapterContent = fs.readFileSync(path.join(process.cwd(), 'services/superAdminCommercialAdapter.ts'), 'utf8');
  const requiredRPCs = [
    'get_public_commercial_plan_catalog',
    'super_admin_get_tenant_commercial_enforcement_snapshot',
    'super_admin_assign_commercial_plan',
    'super_admin_change_subscription_status',
    'super_admin_schedule_plan_change',
    'super_admin_cancel_scheduled_plan_change',
    'super_admin_apply_due_scheduled_plan_change',
    'super_admin_record_billing_transaction',
    'super_admin_manage_tenant_entitlement_override'
  ];
  for (const rpc of requiredRPCs) {
    if (!adapterContent.includes(rpc)) {
      throw new Error(`Missing required RPC invocation: ${rpc}`);
    }
  }
  if (adapterContent.includes('.from(\'subscriptions\').insert') ||
      adapterContent.includes('.from(\'subscriptions\').update') ||
      adapterContent.includes('.from(\'subscriptions\').delete')) {
    throw new Error('Adapter contains direct table write against subscriptions');
  }
});

check('4. SuperAdminCommercialManagementPage UI contains NO payment or iyzico charging controls', () => {
  const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
  const forbidden = ['Pay now', 'Checkout', 'Charge card', 'iyzico', 'Refund through iyzico'];
  for (const f of forbidden) {
    if (pageContent.includes(f)) {
      throw new Error(`Forbidden payment string found: "${f}"`);
    }
  }
});

console.log('\n══════════════════════════════════════════════════════════');
console.log('✅ Stage H1D Super Admin Commercial UI QA PASSED.');
