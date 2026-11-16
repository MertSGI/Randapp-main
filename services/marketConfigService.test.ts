import assert from 'node:assert/strict';
import {
  marketConfigService,
  marketConfigs,
  resolveMarketConfig,
  isValidMarketId,
  getSupportedMarkets,
} from './marketConfigService.ts';

export function runMarketConfigServiceTests(): void {
  // 1. Supported market identifiers
  assert.deepEqual(getSupportedMarkets(), ['tr', 'global']);
  assert.equal(isValidMarketId('tr'), true);
  assert.equal(isValidMarketId('global'), true);
  assert.equal(isValidMarketId('eu'), false);
  assert.equal(isValidMarketId(null), false);

  // 2. Explicit envMarket priority & normalization
  const trFromEnv = resolveMarketConfig({ envMarket: '  TR  ', hostname: 'lari.app' });
  assert.equal(trFromEnv.marketId, 'tr');
  assert.equal(trFromEnv.brandName, 'LARİ');
  assert.equal(trFromEnv.defaultCurrency, 'TRY');
  assert.equal(trFromEnv.primaryDomain, 'randevulari.com');

  const globalFromEnv = resolveMarketConfig({ envMarket: 'global', hostname: 'randevulari.com' });
  assert.equal(globalFromEnv.marketId, 'global');
  assert.equal(globalFromEnv.defaultCurrency, 'USD');
  assert.equal(globalFromEnv.primaryDomain, 'lari.app');

  // 3. Invalid envMarket fails closed to hostname or TR fallback
  const fallbackFromInvalidEnv = resolveMarketConfig({ envMarket: 'invalid-market', hostname: 'app.lari.app' });
  assert.equal(fallbackFromInvalidEnv.marketId, 'global');

  const defaultFallback = resolveMarketConfig({ envMarket: 'unknown', hostname: '' });
  assert.equal(defaultFallback.marketId, 'tr');

  // 4. Domain-suffix anti-spoofing checks (substring spoofing must NOT match)
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'randevulari.com' }).marketId, 'tr');
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'melis.randevulari.com:443' }).marketId, 'tr');
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'lari.app' }).marketId, 'global');
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'app.lari.app' }).marketId, 'global');
  // Spoofed suffix domain must NOT resolve to global via substring match
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'lari.app.attacker.test' }).marketId, 'tr');
  assert.equal(resolveMarketConfig({ envMarket: '', hostname: 'evil-lari.app' }).marketId, 'tr');

  // 5. Cache reset and service accessors
  marketConfigService.resetCache();
  const current = marketConfigService.getCurrentMarketConfig();
  assert.equal(current.brandName, 'LARİ');
  assert.equal(marketConfigService.getBrandName(), 'LARİ');
  assert.equal(marketConfigService.getMarketConfig('global').defaultLocale, marketConfigs.global.defaultLocale);
  assert.deepEqual(marketConfigService.getSupportedLanguages(), current.supportedLanguages);

  console.log('[PASS] marketConfigService tests verified');
}

runMarketConfigServiceTests();
