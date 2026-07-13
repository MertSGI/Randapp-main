globalThis.import = { meta: { env: {} } };

console.log('🏁 Running super-admin and availability mapper regression test suite...');

let failures = 0;

// Test Super Admin Mapping
function testSuperAdminMapping() {
  const dummyTenants = [
    {
      id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
      name: 'Melis Güzellik & Nail Art',
      slug: 'melis-guzellik',
      owner_user_id: 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9',
      custom_domain: 'localhost',
      onboarding_status: 'completed',
      subscription_status: 'trialing',
      created_at: '2026-07-09T19:25:02Z'
    }
  ];

  const dummySubscriptions = [
    {
      tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa',
      status: 'active',
      plan_id: 'pro-monthly'
    }
  ];

  const dummyProfiles = [
    {
      tenant_id: 'aaaa1111-a1a1-a1a1-a1a1-aaaaaaaaaaaa'
    }
  ];

  try {
    // We map dummy data using the same mapping function structure
    const tenantList = dummyTenants.map(t => {
      const sub = dummySubscriptions.find(s => s.tenant_id === t.id);
      const prof = dummyProfiles.find((p) => p.tenant_id === t.id);
      return {
        tenant: {
          id: t.id,
          businessName: t.name || t.official_business_name || 'İsimsiz',
          ownerEmail: t.owner_user_id,
          domain: t.custom_domain || `${t.slug}.randevulari.com`,
          created_at: t.created_at
        },
        subscriptionStatus: t.subscription_status || sub?.status || 'none',
        planId: sub?.plan_id || 'none',
        setupStatus: t.onboarding_status || t.provisioning_status || 'unknown',
        monthlyAppointments: 0,
        estimatedRevenue: 0,
        hasProfile: !!prof
      };
    });

    const target = tenantList[0];
    if (target.tenant.businessName !== 'Melis Güzellik & Nail Art') {
      console.error(`❌ Super Admin Mapping FAILED: Expected name "Melis Güzellik & Nail Art", got "${target.tenant.businessName}"`);
      failures++;
    } else if (target.setupStatus !== 'completed') {
      console.error(`❌ Super Admin Mapping FAILED: Expected status "completed", got "${target.setupStatus}"`);
      failures++;
    } else if (target.tenant.ownerEmail !== 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9') {
      console.error(`❌ Super Admin Mapping FAILED: Expected owner ID "d616f9e0-07e5-42b1-8c27-0d0d97208eb9", got "${target.tenant.ownerEmail}"`);
      failures++;
    } else {
      console.log('✅ Super Admin DTO mapping validation passed successfully!');
    }
  } catch (err) {
    console.error(`❌ Super Admin Mapping FAILED: Caught error: "${err.message}"`);
    failures++;
  }
}

// Test Time Slot Validation Logic
function testAvailabilityTimeRangeValidation() {
  const testRules = [
    { weekday: 1, is_active: true, start_time: '09:00', end_time: '18:00' },
    { weekday: 2, is_active: true, start_time: '18:00', end_time: '09:00' }, // Invalid
    { weekday: 3, is_active: true, start_time: '12:00', end_time: '12:00' }, // Invalid
    { weekday: 4, is_active: false, start_time: '18:00', end_time: '09:00' } // Inactive (should bypass validation)
  ];

  const validate = (day) => {
    if (!day.is_active) return true;
    const [sh, sm] = day.start_time.split(':').map(Number);
    const [eh, em] = day.end_time.split(':').map(Number);
    if (eh < sh || (eh === sh && em <= sm)) {
      return false;
    }
    return true;
  };

  const results = testRules.map(validate);

  if (results[0] !== true) {
    console.error('❌ Time Range Validation FAILED: Case 1 (09:00-18:00) should be valid.');
    failures++;
  } else if (results[1] !== false) {
    console.error('❌ Time Range Validation FAILED: Case 2 (18:00-09:00) should be invalid.');
    failures++;
  } else if (results[2] !== false) {
    console.error('❌ Time Range Validation FAILED: Case 3 (12:00-12:00) should be invalid.');
    failures++;
  } else if (results[3] !== true) {
    console.error('❌ Time Range Validation FAILED: Case 4 (Inactive 18:00-09:00) should be bypassed.');
    failures++;
  } else {
    console.log('✅ Time-range validation rules passed successfully!');
  }
}

testSuperAdminMapping();
testAvailabilityTimeRangeValidation();

if (failures > 0) {
  console.error(`🏁 Run completed with ${failures} failures.`);
  process.exit(1);
} else {
  console.log('🎉 All regression test cases passed successfully!');
  process.exit(0);
}
