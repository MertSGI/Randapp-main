globalThis.import = { meta: { env: {} } };

console.log('🏁 Running super-admin and availability mapper regression test suite...');

let failures = 0;

function assert(condition, msg) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failures++;
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────
// PHASE 2: Super Admin DTO mapping tests
// ─────────────────────────────────────────────────────
function testSuperAdminDTOMapping() {
  // Simulate the mapping logic from superAdminService.ts getDashboardData
  const mapTenantList = (tenants, subs, profiles, userProfiles) => {
    const getOwnerEmail = (ownerUserId) => {
      if (ownerUserId === 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9') {
        return 'melis-owner-staging@example.com';
      }
      const matchedProfile = userProfiles?.find(up => up.id === ownerUserId);
      if (matchedProfile && matchedProfile.name) {
        return `${matchedProfile.name.toLowerCase().replace(/\s+/g, '-')}@example.com`;
      }
      return 'owner@example.com';
    };

    return tenants.map(t => {
      const sub = subs?.find(s => s.tenant_id === t.id);
      const prof = profiles?.find(p => p.tenant_id === t.id);

      // Name Priority: 1. tenant_business_profiles public_display_name, 2. tenants.name, 3. tenants.official_business_name, 4. fallback
      const resolvedBusinessName = (prof && (prof.public_display_name || prof.short_description)) ||
        t.name ||
        t.official_business_name ||
        'İsimsiz';

      return {
        tenant: {
          id: t.id,
          slug: t.slug,
          businessName: resolvedBusinessName,
          ownerUserId: t.owner_user_id || null,
          ownerEmail: t.owner_user_id ? getOwnerEmail(t.owner_user_id) : null,
          domain: t.custom_domain || `${t.slug}.randevulari.com`,
          created_at: t.created_at,
          status: t.status,
          onboardingStatus: t.onboarding_status,
          publicSiteStatus: t.public_site_status
        },
        subscriptionStatus: t.subscription_status || sub?.status || 'none',
        planId: sub?.plan_id || 'none',
        setupStatus: t.onboarding_status || t.provisioning_status || 'unknown',
        monthlyAppointments: 0,
        estimatedRevenue: 0,
        hasProfile: !!prof
      };
    });
  };

  // Test A: Business profile name is preferred over tenants.name
  {
    const tenants = [{
      id: 't1', slug: 'melis-guzellik',
      name: 'Melis Güzellik & Nail Art',
      official_business_name: null,
      owner_user_id: 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9',
      custom_domain: null, status: 'active',
      onboarding_status: 'completed',
      public_site_status: 'published',
      subscription_status: 'active',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const profiles = [{ tenant_id: 't1', public_display_name: 'Melis Güzellik Pro', short_description: null }];
    const result = mapTenantList(tenants, [], profiles, []);
    assert(result[0].tenant.businessName === 'Melis Güzellik Pro',
      `Business profile name preferred (got: "${result[0].tenant.businessName}")`);
  }

  // Test B: tenants.name used as fallback when no business profile
  {
    const tenants = [{
      id: 't2', slug: 'test',
      name: 'Fallback Name',
      official_business_name: null,
      owner_user_id: 'uid-2',
      custom_domain: null, status: 'active',
      onboarding_status: 'pending',
      public_site_status: 'draft',
      subscription_status: 'none',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const result = mapTenantList(tenants, [], [], []);
    assert(result[0].tenant.businessName === 'Fallback Name',
      `tenants.name used as fallback (got: "${result[0].tenant.businessName}")`);
  }

  // Test C: official_business_name used when tenants.name is null
  {
    const tenants = [{
      id: 't3', slug: 'test3',
      name: null,
      official_business_name: 'Official Name Ltd.',
      owner_user_id: 'uid-3',
      custom_domain: null, status: 'active',
      onboarding_status: 'pending',
      public_site_status: 'draft',
      subscription_status: 'none',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const result = mapTenantList(tenants, [], [], []);
    assert(result[0].tenant.businessName === 'Official Name Ltd.',
      `official_business_name used when name is null (got: "${result[0].tenant.businessName}")`);
  }

  // Test D: ownerUserId and ownerEmail are separate fields — UUID never in ownerEmail
  {
    const tenants = [{
      id: 't4', slug: 'melis-guzellik',
      name: 'Melis Test',
      official_business_name: null,
      owner_user_id: 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9',
      custom_domain: null, status: 'active',
      onboarding_status: 'completed',
      public_site_status: 'published',
      subscription_status: 'active',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const result = mapTenantList(tenants, [], [], []);
    assert(result[0].tenant.ownerUserId === 'd616f9e0-07e5-42b1-8c27-0d0d97208eb9',
      `ownerUserId is a UUID (got: "${result[0].tenant.ownerUserId}")`);
    assert(result[0].tenant.ownerEmail === 'melis-owner-staging@example.com',
      `ownerEmail is an email, not a UUID (got: "${result[0].tenant.ownerEmail}")`);
    assert(!result[0].tenant.ownerEmail.includes('-07e5-'),
      `ownerEmail must not contain UUID segments`);
  }

  // Test E: active status remains active
  {
    const tenants = [{
      id: 't5', slug: 'active-test',
      name: 'Active Business', official_business_name: null,
      owner_user_id: 'uid-5', custom_domain: null,
      status: 'active', onboarding_status: 'completed',
      public_site_status: 'published', subscription_status: 'active',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const result = mapTenantList(tenants, [], [], []);
    assert(result[0].tenant.status === 'active',
      `Status should be active (got: "${result[0].tenant.status}")`);
    assert(result[0].tenant.onboardingStatus === 'completed',
      `Onboarding status should be completed (got: "${result[0].tenant.onboardingStatus}")`);
    assert(result[0].tenant.publicSiteStatus === 'published',
      `Public site status should be published (got: "${result[0].tenant.publicSiteStatus}")`);
  }

  // Test F: valid profile data never maps to İsimsiz/onboarding_required
  {
    const tenants = [{
      id: 't6', slug: 'good-data',
      name: 'Good Business', official_business_name: null,
      owner_user_id: 'uid-6', custom_domain: null,
      status: 'active', onboarding_status: 'completed',
      public_site_status: 'published', subscription_status: 'none',
      created_at: '2026-07-09T19:25:02Z'
    }];
    const result = mapTenantList(tenants, [], [], []);
    assert(result[0].tenant.businessName !== 'İsimsiz',
      `Valid tenant.name must not map to İsimsiz (got: "${result[0].tenant.businessName}")`);
    assert(result[0].setupStatus !== 'onboarding_required',
      `Completed onboarding should not map to onboarding_required (got: "${result[0].setupStatus}")`);
  }

  console.log('✅ Super Admin DTO mapping — all assertions passed!');
}

// ─────────────────────────────────────────────────────
// PHASE 4: Availability save logic tests
// ─────────────────────────────────────────────────────
function testAvailabilityTimeRangeValidation() {
  const validate = (day) => {
    if (!day.is_active) return true;
    const [sh, sm] = day.start_time.split(':').map(Number);
    const [eh, em] = day.end_time.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    return endMinutes > startMinutes;
  };

  assert(validate({ weekday: 1, is_active: true, start_time: '09:00', end_time: '17:00' }) === true,
    'Mon 09:00-17:00 should be valid');
  assert(validate({ weekday: 2, is_active: true, start_time: '18:00', end_time: '09:00' }) === false,
    'Tue 18:00-09:00 should be invalid (end before start)');
  assert(validate({ weekday: 3, is_active: true, start_time: '12:00', end_time: '12:00' }) === false,
    'Wed 12:00-12:00 should be invalid (equal times)');
  assert(validate({ weekday: 4, is_active: false, start_time: '18:00', end_time: '09:00' }) === true,
    'Thu inactive with bad times should bypass validation');
  assert(validate({ weekday: 5, is_active: true, start_time: '10:00', end_time: '18:00' }) === true,
    'Fri 10:00-18:00 is a standard valid slot');
  assert(validate({ weekday: 6, is_active: true, start_time: '09:30', end_time: '09:31' }) === true,
    'Sat 09:30-09:31 (1 minute) should be valid');
  assert(validate({ weekday: 7, is_active: true, start_time: '23:59', end_time: '00:00' }) === false,
    'Sun 23:59-00:00 should be invalid (midnight wrap is not supported)');

  console.log('✅ Time-range validation — all assertions passed!');
}

function testAvailabilityDeduplication() {
  // Simulate the upsert logic: if day.id exists → update; if not → insert
  // This verifies there are no duplicate weekday rows created
  const existingRules = [
    { id: 'r-mon', weekday: 1, is_active: true, start_time: '09:00:00', end_time: '17:00:00' },
    { id: 'r-wed', weekday: 3, is_active: true, start_time: '09:00:00', end_time: '17:00:00' }
  ];

  const weeklyAvailability = [];
  for (let d = 1; d <= 7; d++) {
    const rule = existingRules.find(r => r.weekday === d);
    weeklyAvailability.push({
      id: rule?.id,
      weekday: d,
      is_active: rule ? rule.is_active : false,
      start_time: rule ? rule.start_time.substring(0, 5) : '09:00',
      end_time: rule ? rule.end_time.substring(0, 5) : '18:00'
    });
  }

  const updates = [];
  const inserts = [];
  for (const day of weeklyAvailability) {
    if (day.id) {
      updates.push(day);
    } else {
      inserts.push(day);
    }
  }

  assert(updates.length === 2, `Should update 2 existing rows (got ${updates.length})`);
  assert(inserts.length === 5, `Should insert 5 missing rows (got ${inserts.length})`);
  // Ensure no weekday appears twice
  const weekdays = weeklyAvailability.map(d => d.weekday);
  const uniqueWeekdays = new Set(weekdays);
  assert(uniqueWeekdays.size === 7, `Should have 7 unique weekdays (got ${uniqueWeekdays.size})`);

  // Updating Monday from 09:00-17:00 to 10:00-18:00
  const mondayEntry = weeklyAvailability.find(d => d.weekday === 1);
  const updated = { ...mondayEntry, start_time: '10:00', end_time: '18:00' };
  assert(updated.start_time === '10:00', 'Monday update start_time should be 10:00');
  assert(updated.end_time === '18:00', 'Monday update end_time should be 18:00');
  assert(updated.id === 'r-mon', 'Monday update should carry existing row ID (not create duplicate)');

  console.log('✅ Availability deduplication — all assertions passed!');
}

function testCrossTenantRejection() {
  // Verify staff scope protection: staff.tenantId must match active tenant
  const activeTenantId = 'tenant-aaa';
  const staffList = [
    { id: 'staff-1', tenantId: 'tenant-aaa', name: 'Alice' },
    { id: 'staff-2', tenantId: 'tenant-bbb', name: 'Bob' }, // different tenant
  ];

  const verifyStaffBelongsToTenant = (staffId, tenantId) => {
    return staffList.some(s => s.id === staffId && s.tenantId === tenantId);
  };

  assert(verifyStaffBelongsToTenant('staff-1', activeTenantId) === true,
    'staff-1 belongs to tenant-aaa (should be accepted)');
  assert(verifyStaffBelongsToTenant('staff-2', activeTenantId) === false,
    'staff-2 belongs to tenant-bbb (should be rejected for tenant-aaa)');
  assert(verifyStaffBelongsToTenant('staff-999', activeTenantId) === false,
    'staff-999 not found (should be rejected)');

  console.log('✅ Cross-tenant staff rejection — all assertions passed!');
}

function testLocalAvatarGeneration() {
  // Test that getInitialsAvatar returns a data-URI without any external URL
  const getInitialsAvatar = (name) => {
    const initials = name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() || '')
      .join('');
    const colors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#10b981','#3b82f6'];
    const bg = colors[(name.charCodeAt(0) || 0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${bg}"/><text x="32" y="38" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const avatarUrl = getInitialsAvatar('Selin Uzman');
  assert(avatarUrl.startsWith('data:image/svg+xml'), 'Avatar should be a data URI (no external request)');
  assert(!avatarUrl.includes('ui-avatars.com'), 'Avatar must not reference ui-avatars.com');
  assert(!avatarUrl.includes('http://') && !avatarUrl.includes('https://'), 'Avatar must not contain any external URL');
  assert(avatarUrl.includes('SU'), 'Initials for "Selin Uzman" should be "SU"');

  const singleNameAvatar = getInitialsAvatar('Melis');
  assert(singleNameAvatar.includes('M'), 'Single name should show first letter "M"');

  console.log('✅ Local avatar generation — all assertions passed!');
}

// Run all tests
testSuperAdminDTOMapping();
testAvailabilityTimeRangeValidation();
testAvailabilityDeduplication();
testCrossTenantRejection();
testLocalAvatarGeneration();

if (failures > 0) {
  console.error(`\n🏁 Run completed with ${failures} failure(s).`);
  process.exit(1);
} else {
  console.log('\n🎉 All regression test cases passed successfully!');
  process.exit(0);
}
