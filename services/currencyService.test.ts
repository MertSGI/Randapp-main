import assert from 'node:assert/strict';
import {
  currencyService,
  normalizeCurrencyCode,
  isValidIsoCurrencyCode,
} from './currencyService.ts';
import { marketConfigs } from './marketConfigService.ts';

export function runCurrencyServiceTests(): void {
  // 1. ISO currency normalization & validation
  assert.equal(normalizeCurrencyCode(' try '), 'TRY');
  assert.equal(normalizeCurrencyCode('usd'), 'USD');
  assert.equal(normalizeCurrencyCode('TR'), null);
  assert.equal(normalizeCurrencyCode('TRY1'), null);
  assert.equal(normalizeCurrencyCode('123'), null);
  assert.equal(isValidIsoCurrencyCode('EUR'), true);
  assert.equal(isValidIsoCurrencyCode('invalid'), false);

  // 2. Market currency support checks
  assert.equal(currencyService.getPrimaryCurrency(marketConfigs.tr), 'TRY');
  assert.equal(currencyService.getPrimaryCurrency(marketConfigs.global), 'USD');
  assert.equal(currencyService.isCurrencySupported('try', marketConfigs.tr), true);
  assert.equal(currencyService.isCurrencySupported('USD', marketConfigs.tr), false);
  assert.equal(currencyService.isCurrencySupported('eur', marketConfigs.global), true);
  assert.equal(currencyService.isCurrencySupported('JPY', marketConfigs.global), false);

  // 3. Fail-closed market currency resolution
  const trValid = currencyService.resolveMarketCurrency('try', marketConfigs.tr);
  assert.deepEqual(trValid, {
    currency: 'TRY',
    supported: true,
    fallbackApplied: false,
    reasonCode: 'OK',
  });

  const trUnsupported = currencyService.resolveMarketCurrency('USD', marketConfigs.tr);
  assert.equal(trUnsupported.currency, 'TRY');
  assert.equal(trUnsupported.supported, false);
  assert.equal(trUnsupported.fallbackApplied, true);
  assert.equal(trUnsupported.reasonCode, 'UNSUPPORTED_MARKET_CURRENCY_FALLBACK');

  const invalidFallback = currencyService.resolveMarketCurrency('INVALID_CODE', marketConfigs.global);
  assert.equal(invalidFallback.currency, 'USD');
  assert.equal(invalidFallback.supported, false);
  assert.equal(invalidFallback.fallbackApplied, true);
  assert.equal(invalidFallback.reasonCode, 'INVALID_CURRENCY_FALLBACK');

  // 4. Safe formatting — never throws on invalid currencies or non-finite numbers
  const formattedTr = currencyService.formatPrice(1250, 'TRY', marketConfigs.tr);
  assert.ok(formattedTr.includes('1.250') || formattedTr.includes('1,250'));

  // Unsupported currency for active market must fall back to market defaultCurrency
  const expectedTrFallback = currencyService.formatPrice(500, 'TRY', marketConfigs.tr);
  const trUsdFallback = currencyService.formatPrice(500, 'USD', marketConfigs.tr);
  assert.equal(trUsdFallback, expectedTrFallback);
  assert.equal(trUsdFallback.includes('$') || trUsdFallback.includes('USD'), false);

  const expectedGlobalFallback = currencyService.formatPrice(500, 'USD', marketConfigs.global);
  const globalJpyFallback = currencyService.formatPrice(500, 'JPY', marketConfigs.global);
  assert.equal(globalJpyFallback, expectedGlobalFallback);
  assert.equal(globalJpyFallback.includes('¥') || globalJpyFallback.includes('JPY'), false);

  const globalEurSupported = currencyService.formatPrice(500, 'EUR', marketConfigs.global);
  assert.ok(globalEurSupported.includes('€') || globalEurSupported.includes('EUR'));

  const trMinorUsdFallback = currencyService.formatMinorUnits(50000, 'USD', marketConfigs.tr);
  assert.equal(trMinorUsdFallback, expectedTrFallback);

  const formattedInvalidCurrency = currencyService.formatPrice(500, 'NOT_A_CURRENCY', marketConfigs.tr);
  assert.ok(formattedInvalidCurrency.includes('500'));

  const formattedNaN = currencyService.formatPrice(Number.NaN, 'USD', marketConfigs.global);
  assert.ok(formattedNaN.includes('0'));

  const formattedMinor = currencyService.formatMinorUnits(15050, 'USD', marketConfigs.global);
  assert.ok(formattedMinor.includes('150.5') || formattedMinor.includes('150,5'));

  // 5. Honest 0-TL FX conversion classification
  const fx = currencyService.getFxConversionAvailability();
  assert.equal(fx.supported, false);
  assert.equal(fx.availabilityTier, 'DISABLED_EXTERNAL_HOLD');
  assert.equal(fx.reasonCode, 'FX_ORACLE_EXTERNAL_HOLD');

  console.log('[PASS] currencyService tests verified');
}

runCurrencyServiceTests();
