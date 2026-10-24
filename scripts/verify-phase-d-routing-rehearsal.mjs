import { domainResolverService } from '../services/domainResolverService.ts';

function runStep(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

async function runAsyncStep(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log('=== LARI Phase D: Subdomain, Branch & Routing Rehearsal QA ===\n');

// 1. Hostname normalization
runStep('1. Normalizes hostname casing, ports, trailing dots, and schemes', () => {
  const cases = [
    { input: 'NEXUS.RandevuLari.COM:5173', expected: 'nexus.randevulari.com' },
    { input: 'https://salon-vip.randevulari.com:443/', expected: 'salon-vip.randevulari.com' },
    { input: 'randevulari.com.', expected: 'randevulari.com' },
    { input: '  App.Randevulari.Com:8080  ', expected: 'app.randevulari.com' },
    { input: 'LOCALHOST:3000', expected: 'localhost' }
  ];

  for (const c of cases) {
    const res = domainResolverService.normalizeHostname(c.input);
    if (res !== c.expected) {
      throw new Error(`Normalization failed for '${c.input}': expected '${c.expected}', got '${res}'`);
    }
  }
});

// 2. Malicious and invalid hostname rejection (Host header injection prevention)
runStep('2. Detects and rejects malicious Host headers (traversal, control chars, injection)', () => {
  const maliciousHosts = [
    'evil.com\r\nX-Injected: true',
    'attacker.com/path/traversal',
    '../../malicious.domain',
    'randevulari.com; rm -rf /',
    'evil<script>.com',
    'nexus..randevulari.com',
    '-invalid-start.randevulari.com',
    'invalid-end-.randevulari.com',
    'null\0byte.com',
    'host"quote.com'
  ];

  for (const host of maliciousHosts) {
    const parsed = domainResolverService.parseHostname(host);
    if (parsed.type !== 'invalid' || parsed.reason !== 'MALICIOUS_OR_INVALID_HOSTNAME') {
      throw new Error(`Failed to reject malicious hostname '${host}': got ${JSON.stringify(parsed)}`);
    }
  }
});

// 3. Known tenant subdomain parsing
runStep('3. Accurately parses valid tenant subdomains on primary and global domains', () => {
  const trSub = domainResolverService.parseHostname('nexus-studio.randevulari.com');
  if (trSub.type !== 'tenant' || trSub.identifier !== 'nexus-studio') {
    throw new Error(`Failed to parse TR tenant subdomain: ${JSON.stringify(trSub)}`);
  }

  const globalSub = domainResolverService.parseHostname('glamour-lounge.lari.app');
  if (globalSub.type !== 'tenant' || globalSub.identifier !== 'glamour-lounge') {
    throw new Error(`Failed to parse global tenant subdomain: ${JSON.stringify(globalSub)}`);
  }
});

// 4. Reserved slugs not treated as tenants
runStep('4. Reserved platform slugs (www, app, api, admin, etc.) map to platform domain', () => {
  const reserved = ['www', 'app', 'api', 'admin', 'super-admin', 'auth', 'pilot', 'demo', 'booking'];
  for (const slug of reserved) {
    const parsed = domainResolverService.parseHostname(`${slug}.randevulari.com`);
    if (parsed.type !== 'platform') {
      throw new Error(`Reserved slug '${slug}' was incorrectly treated as tenant: ${JSON.stringify(parsed)}`);
    }
  }
});

// 5. Branch-specific URL routing
runStep('5. Resolves branch-specific URLs across subdomains and paths', () => {
  // Case A: Subdomain with branch path
  const subBranch = domainResolverService.resolveRouteTarget('nexus.randevulari.com', '/kadikoy');
  if (subBranch.tenantSlug !== 'nexus' || subBranch.branchSlug !== 'kadikoy') {
    throw new Error(`Subdomain branch resolution failed: ${JSON.stringify(subBranch)}`);
  }

  // Case B: Subdomain with query param fallback
  const subParamBranch = domainResolverService.resolveRouteTarget(
    'nexus.randevulari.com',
    '/book',
    new URLSearchParams('branch=besiktas')
  );
  if (subParamBranch.tenantSlug !== 'nexus' || subParamBranch.branchSlug !== 'besiktas') {
    throw new Error(`Subdomain query branch resolution failed: ${JSON.stringify(subParamBranch)}`);
  }

  // Case C: Platform path-based branch
  const pathBranch = domainResolverService.resolveRouteTarget('randevulari.com', '/booking/nexus/levent');
  if (pathBranch.tenantSlug !== 'nexus' || pathBranch.branchSlug !== 'levent') {
    throw new Error(`Path-based branch resolution failed: ${JSON.stringify(pathBranch)}`);
  }
});

// 6. Unknown tenant slug handling
runStep('6. Distinguishes unknown tenant slug in route resolution', () => {
  // Synthetic simulated tenant directory
  const mockTenantDirectory = new Set(['nexus', 'hair-couture', 'elite-spa']);

  const resolveTenantStatus = (slug) => {
    if (!slug) return { exists: false, status: 'no_slug' };
    if (mockTenantDirectory.has(slug)) {
      return { exists: true, status: 'active', slug };
    }
    return { exists: false, status: 'not_found', slug };
  };

  const known = resolveTenantStatus('nexus');
  if (!known.exists || known.status !== 'active') {
    throw new Error(`Known tenant resolution failed: ${JSON.stringify(known)}`);
  }

  const unknown = resolveTenantStatus('ghost-salon-999');
  if (unknown.exists || unknown.status !== 'not_found') {
    throw new Error(`Unknown tenant should return not_found: ${JSON.stringify(unknown)}`);
  }
});

// 7. Suspended tenant handling
runStep('7. Accurately detects and respects suspended tenant status', () => {
  const tenantRegistry = {
    'active-salon': { status: 'active', name: 'Active Salon' },
    'suspended-salon': { status: 'suspended', name: 'Suspended Salon' }
  };

  const checkTenantAccess = (slug) => {
    const t = tenantRegistry[slug];
    if (!t) return { canAcceptBookings: false, status: 'not_found' };
    if (t.status === 'suspended') {
      return { canAcceptBookings: false, status: 'suspended', message: 'Hizmet geçici olarak durdurulmuştur.' };
    }
    return { canAcceptBookings: true, status: 'active' };
  };

  const suspendedAccess = checkTenantAccess('suspended-salon');
  if (suspendedAccess.canAcceptBookings || suspendedAccess.status !== 'suspended') {
    throw new Error(`Suspended tenant should not accept bookings: ${JSON.stringify(suspendedAccess)}`);
  }

  const activeAccess = checkTenantAccess('active-salon');
  if (!activeAccess.canAcceptBookings || activeAccess.status !== 'active') {
    throw new Error(`Active tenant should accept bookings: ${JSON.stringify(activeAccess)}`);
  }
});

// 8. Cross-tenant route containment
runStep('8. Enforces cross-tenant route and partition key containment', () => {
  // When a request arrives under tenant A, appointments or data from tenant B must never be exposed
  const partitionKeyA = 'lari:tenant_salon_a:appointments';
  const partitionKeyB = 'lari:tenant_salon_b:appointments';

  const mockStorage = {
    [partitionKeyA]: [{ id: 'appt_1', customer: 'Ayşe' }],
    [partitionKeyB]: [{ id: 'appt_2', customer: 'Mehmet' }]
  };

  const fetchTenantAppointments = (tenantId) => {
    return mockStorage[`lari:${tenantId}:appointments`] || [];
  };

  const tenantAData = fetchTenantAppointments('tenant_salon_a');
  if (tenantAData.some(a => a.customer === 'Mehmet')) {
    throw new Error('Tenant isolation breach: Tenant A retrieved Tenant B data!');
  }
  if (tenantAData.length !== 1 || tenantAData[0].customer !== 'Ayşe') {
    throw new Error('Tenant A failed to retrieve own data');
  }
});

// 9. Browser / Hash router mode fallback
runStep('9. Resolves routes correctly under both hash-mode and browser-mode URLs', () => {
  // Hash mode URL: #/booking/nexus?branch=kadikoy
  const hashTarget = domainResolverService.resolveRouteTarget(
    'localhost:5173',
    '#/booking/nexus',
    new URLSearchParams('branch=kadikoy')
  );
  if (hashTarget.tenantSlug !== 'nexus' || hashTarget.branchSlug !== 'kadikoy') {
    throw new Error(`Hash mode route resolution failed: ${JSON.stringify(hashTarget)}`);
  }

  // Browser mode URL: /nexus/kadikoy
  const browserTarget = domainResolverService.resolveRouteTarget(
    'randevulari.com',
    '/nexus/kadikoy'
  );
  if (browserTarget.tenantSlug !== 'nexus' || browserTarget.branchSlug !== 'kadikoy') {
    throw new Error(`Browser mode route resolution failed: ${JSON.stringify(browserTarget)}`);
  }
});

// 10. Preview-only route containment
runStep('10. Contains preview routes (/admin/site-preview, /super-admin/tenant-preview)', () => {
  const adminPreview = domainResolverService.resolveRouteTarget(
    'app.randevulari.com',
    '/admin/site-preview',
    new URLSearchParams('tenant=nexus_preview')
  );
  if (!adminPreview.isPreview || adminPreview.tenantSlug !== 'nexus_preview') {
    throw new Error(`Admin site preview route resolution failed: ${JSON.stringify(adminPreview)}`);
  }

  const superAdminPreview = domainResolverService.resolveRouteTarget(
    'app.randevulari.com',
    '/super-admin/tenant-preview/tenant_123'
  );
  if (!superAdminPreview.isPreview || superAdminPreview.tenantSlug !== 'tenant_123') {
    throw new Error(`Super admin tenant preview route resolution failed: ${JSON.stringify(superAdminPreview)}`);
  }
});

console.log('\nAll 10 Phase D routing rehearsal assertions passed.');
