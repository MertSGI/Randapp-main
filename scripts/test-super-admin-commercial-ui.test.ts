import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Stage H1D — Super Admin Commercial UI Security & Invariants QA', () => {

  it('1. Route authorization for /super-admin/commercial requires super_admin role', () => {
    const appContent = fs.readFileSync(path.join(process.cwd(), 'App.tsx'), 'utf8');
    expect(appContent).toContain('path="/super-admin/commercial"');
    expect(appContent).toContain('allowedRoles={[\'super_admin\']}');
  });

  it('2. SuperAdminLayout contains Ticari Yönetim & Lisans navigation link', () => {
    const layoutContent = fs.readFileSync(path.join(process.cwd(), 'components/layouts/SuperAdminLayout.tsx'), 'utf8');
    expect(layoutContent).toContain('path: \'/super-admin/commercial\'');
    expect(layoutContent).toContain('Ticari Yönetim & Lisans');
  });

  it('3. superAdminCommercialAdapter uses RPCs exclusively without direct table writes', () => {
    const adapterContent = fs.readFileSync(path.join(process.cwd(), 'services/superAdminCommercialAdapter.ts'), 'utf8');
    
    // Check RPC invocations
    expect(adapterContent).toContain('supabase.rpc(\'get_public_commercial_plan_catalog\')');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_get_tenant_commercial_enforcement_snapshot\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_assign_commercial_plan\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_change_subscription_status\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_schedule_plan_change\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_cancel_scheduled_plan_change\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_apply_due_scheduled_plan_change\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_record_billing_transaction\'');
    expect(adapterContent).toContain('supabase.rpc(\'super_admin_manage_tenant_entitlement_override\'');

    // Zero direct table writes in adapter
    expect(adapterContent).not.toContain('.from(\'subscriptions\').insert');
    expect(adapterContent).not.toContain('.from(\'subscriptions\').update');
    expect(adapterContent).not.toContain('.from(\'subscriptions\').delete');
  });

  it('4. SuperAdminCommercialManagementPage UI contains NO payment or iyzico charging controls', () => {
    const pageContent = fs.readFileSync(path.join(process.cwd(), 'pages/super-admin/SuperAdminCommercialManagementPage.tsx'), 'utf8');
    
    expect(pageContent).not.toContain('Pay now');
    expect(pageContent).not.toContain('Checkout');
    expect(pageContent).not.toContain('Charge card');
    expect(pageContent).not.toContain('iyzico');
    expect(pageContent).not.toContain('Refund through iyzico');
  });

});
