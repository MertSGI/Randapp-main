import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateBookingConfirmation,
  analyzeSchedule,
  generateFullConsultation,
  generateFullConsultationWithStatus,
  getGeminiFeatureAvailability,
} from './geminiService.ts';
import type { Appointment } from '../types.ts';

const SYNTH_APPOINTMENT: Appointment = {
  id: 'apt-synth-001',
  tenantId: 'tenant-synth-001',
  userId: 'user-synth-001',
  user_name: 'Ayşe Yılmaz',
  user_email: 'ayse@example.test',
  phone: '+905550000000',
  serviceId: 'svc-001',
  staffId: 'stf-001',
  date: '2026-11-20',
  time: '14:00',
  status: 'confirmed',
  createdAt: '2026-11-16T10:00:00Z',
  syncedToGoogle: false,
};

export async function runGeminiServiceTests(): Promise<void> {
  // Verify ZERO network calls occur by overriding global fetch during tests
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('Network call is strictly forbidden in geminiService');
  }) as typeof fetch;

  try {
    // 1. Static safety: no SDK or direct Google Gemini API endpoint in source
    const source = fs.readFileSync(path.join(process.cwd(), 'services', 'geminiService.ts'), 'utf8');
    assert.equal(source.includes('@google/genai'), false, 'Frontend geminiService must not import @google/genai');
    assert.equal(
      source.includes('generativelanguage.googleapis.com'),
      false,
      'Frontend geminiService must not reference Gemini API URL'
    );

    // 2. Booking confirmation is fail-closed null
    const conf = await generateBookingConfirmation(SYNTH_APPOINTMENT, 'Saç Kesimi', 'tr');
    assert.equal(conf, null);

    // 3. Schedule analysis returns honest DISABLED_EXTERNAL_HOLD notice in both languages
    const trAnalysis = await analyzeSchedule([SYNTH_APPOINTMENT], 'tr');
    assert.ok(trAnalysis.includes('DISABLED_EXTERNAL_HOLD'));
    const enAnalysis = await analyzeSchedule([SYNTH_APPOINTMENT], 'en');
    assert.ok(enAnalysis.includes('DISABLED_EXTERNAL_HOLD'));

    // 4. In supabase mode, consultation fails closed (null + DISABLED_EXTERNAL_HOLD)
    const supaStatus = getGeminiFeatureAvailability({ feature: 'consultation_preview', mode: 'supabase' });
    assert.equal(supaStatus.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
    assert.equal(supaStatus.isAvailable, false);

    const supaResult = await generateFullConsultationWithStatus('Katlı kesim önerisi', undefined, 'tr', {
      mode: 'supabase',
    });
    assert.equal(supaResult.success, false);
    assert.equal(supaResult.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
    assert.equal(supaResult.reasonCode, 'AI_EXTERNAL_HOLD');
    assert.equal(supaResult.data, null);

    const supaDirect = await generateFullConsultation('Layered haircut', undefined, 'en', { mode: 'supabase' });
    assert.equal(supaDirect, null);

    // 5. In local sandbox mode, blank prompt fails closed, valid prompt returns deterministic local preview
    const blankLocal = await generateFullConsultationWithStatus('   ', undefined, 'tr', {
      mode: 'local',
      aiMode: 'mock',
    });
    assert.equal(blankLocal.success, false);
    assert.equal(blankLocal.reasonCode, 'INVALID_PROMPT');
    assert.equal(blankLocal.data, null);

    const validLocal = await generateFullConsultationWithStatus('Doğal balyaj önerisi', undefined, 'tr', {
      mode: 'local',
      aiMode: 'mock',
    });
    assert.equal(validLocal.success, true);
    assert.equal(validLocal.availabilityTier, 'LOCAL_OR_SANDBOX_ONLY');
    assert.ok(validLocal.data?.text.includes('LOCAL_OR_SANDBOX_ONLY'));
    assert.equal(validLocal.data?.image, null, 'Must not emit external Unsplash URLs');

    assert.equal(fetchCalled, false, 'geminiService must never invoke fetch');
    console.log('[PASS] geminiService tests verified');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await runGeminiServiceTests();
