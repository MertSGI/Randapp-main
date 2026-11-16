import assert from 'node:assert/strict';

// Install deterministic localStorage polyfill BEFORE importing service modules
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const {
  adminFeatureAvailabilityService,
  classifyFeature,
  getAllFeatureIds,
  getFeatureAvailabilityMatrix,
  getFeatureAvailabilitySummary,
} = await import('./adminFeatureAvailabilityService.ts');

export async function runAdminFeatureAvailabilityServiceTests(): Promise<void> {
  const validTiers = new Set(['LIVE_ACTIVE', 'LOCAL_OR_SANDBOX_ONLY', 'DISABLED_EXTERNAL_HOLD']);

  // 1. Every registered feature has a valid 3-tier classification in both modes
  for (const mode of ['local', 'supabase'] as const) {
    const matrix = getFeatureAvailabilityMatrix({ dataMode: mode });
    assert.equal(matrix.length, getAllFeatureIds().length);
    assert.ok(matrix.length >= 25);
    for (const item of matrix) {
      assert.ok(validTiers.has(item.tier), `Invalid tier for ${item.featureId}: ${item.tier}`);
    }
  }

  // 2. Local mode classifies core operations as LOCAL_OR_SANDBOX_ONLY, external/AI edge as DISABLED_EXTERNAL_HOLD
  const localSummary = getFeatureAvailabilitySummary({ dataMode: 'local' });
  assert.equal(localSummary.liveActiveCount, 0, 'Local mode must report 0 LIVE_ACTIVE features');
  assert.ok(localSummary.localOrSandboxOnlyCount > 0);
  assert.ok(localSummary.disabledExternalHoldCount > 0);

  const localPreview = classifyFeature('gemini_style_consultation_preview', { dataMode: 'local' });
  assert.equal(localPreview.tier, 'LOCAL_OR_SANDBOX_ONLY');
  assert.equal(localPreview.isAccessible, true);

  // 3. Supabase 0-TL mode: core DB features LIVE_ACTIVE, live PSP/SMS/FX/AI remain DISABLED_EXTERNAL_HOLD
  const supaSummary = getFeatureAvailabilitySummary({ dataMode: 'supabase' });
  assert.ok(supaSummary.liveActiveCount > 0);
  assert.ok(supaSummary.disabledExternalHoldCount >= 10);

  const externalHoldIds = [
    'live_online_checkout_iyzico',
    'live_sms_whatsapp_notifications',
    'live_email_delivery',
    'live_custom_domain_dns_ssl',
    'live_fx_currency_conversion',
    'pos_card_terminal_psp',
    'pos_customer_wallet_settlement',
    'gemini_booking_confirmation',
    'gemini_schedule_analysis',
    'gemini_style_consultation_preview',
    'ai_image_visualization',
    'clinic_ai_transcription',
    'clinic_ai_soap_draft',
    'health_tourism_ai_chat',
  ];

  for (const featureId of externalHoldIds) {
    const res = classifyFeature(featureId, { dataMode: 'supabase' });
    assert.equal(res.tier, 'DISABLED_EXTERNAL_HOLD', `${featureId} must default to DISABLED_EXTERNAL_HOLD`);
    assert.equal(res.isAccessible, false, `${featureId} must not be accessible in 0-TL mode`);
    assert.equal(res.requiresServerSecret, true);
  }

  // 4. Unknown feature ID fails closed
  const unknown = classifyFeature('non_existent_feature_xyz', { dataMode: 'supabase' });
  assert.equal(unknown.tier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(unknown.isAccessible, false);
  assert.equal(unknown.reasonCode, 'UNKNOWN_FEATURE_FAIL_CLOSED');

  // 5. Tab-level availability preserves pilot demo access & locks AI/external/unknown tabs fail-closed
  const dashboardAvail = await adminFeatureAvailabilityService.getAvailability('tenant_pilot_demo', 'dashboard', {
    dataMode: 'local',
  });
  assert.equal(dashboardAvail.isAccessible, true);
  assert.equal(dashboardAvail.availabilityTier, 'LOCAL_OR_SANDBOX_ONLY');

  const aiTabAvail = await adminFeatureAvailabilityService.getAvailability('tenant_pilot_demo', 'clinic-ai', {
    dataMode: 'supabase',
  });
  assert.equal(aiTabAvail.isAccessible, false);
  assert.equal(aiTabAvail.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(aiTabAvail.recommendedAction, 'external_hold');

  const unknownTabAvail = await adminFeatureAvailabilityService.getAvailability('tenant_pilot_demo', 'mystery-tab', {
    dataMode: 'supabase',
  });
  assert.equal(unknownTabAvail.isAccessible, false);
  assert.equal(unknownTabAvail.availabilityTier, 'DISABLED_EXTERNAL_HOLD');

  console.log('[PASS] adminFeatureAvailabilityService tests verified');
}

await runAdminFeatureAvailabilityServiceTests();
