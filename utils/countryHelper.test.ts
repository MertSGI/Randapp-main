import assert from 'node:assert/strict';
import {
  getLocalizedCountries,
  isValidIsoCountryCode,
  normalizeCountryCode,
  getCountryDisplayName,
} from './countryHelper.ts';

export function runCountryHelperTests(): void {
  // 1. Valid and empty ISO country codes
  assert.equal(isValidIsoCountryCode(null), true);
  assert.equal(isValidIsoCountryCode(undefined), true);
  assert.equal(isValidIsoCountryCode('   '), true);
  assert.equal(isValidIsoCountryCode('tr'), true);
  assert.equal(isValidIsoCountryCode(' DE '), true);
  assert.equal(isValidIsoCountryCode('XX'), false);
  assert.equal(isValidIsoCountryCode('TUR'), false);

  // 2. Normalization & display name
  assert.equal(normalizeCountryCode(' tr '), 'TR');
  assert.equal(normalizeCountryCode('XX'), null);
  assert.equal(normalizeCountryCode(''), null);
  assert.ok(getCountryDisplayName('tr', 'tr').length >= 2);
  assert.equal(getCountryDisplayName('XX', 'en'), '');

  // 3. Localized country list works for valid and invalid locales without throwing
  const trList = getLocalizedCountries('tr');
  assert.ok(trList.length >= 25);
  assert.ok(trList.some((c) => c.code === 'TR'));

  const invalidLocaleList = getLocalizedCountries('invalid_locale_!!!');
  assert.equal(invalidLocaleList.length, trList.length);

  console.log('[PASS] countryHelper tests verified');
}

runCountryHelperTests();
