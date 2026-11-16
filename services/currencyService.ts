import { marketConfigService, type MarketConfig } from './marketConfigService';

const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

export interface SafeCurrencyResolution {
  currency: string;
  supported: boolean;
  fallbackApplied: boolean;
  reasonCode: 'OK' | 'INVALID_CURRENCY_FALLBACK' | 'UNSUPPORTED_MARKET_CURRENCY_FALLBACK';
}

export interface FxConversionAvailability {
  supported: false;
  availabilityTier: 'DISABLED_EXTERNAL_HOLD';
  reasonCode: 'FX_ORACLE_EXTERNAL_HOLD';
  message: string;
}

/**
 * Normalizes a currency string to uppercase trimmed 3-letter ISO 4217 format,
 * or returns null when invalid.
 */
export function normalizeCurrencyCode(currency: unknown): string | null {
  if (typeof currency !== 'string') return null;
  const normalized = currency.trim().toUpperCase();
  return ISO_CURRENCY_REGEX.test(normalized) ? normalized : null;
}

export function isValidIsoCurrencyCode(currency: unknown): boolean {
  return normalizeCurrencyCode(currency) !== null;
}

export const currencyService = {
  getPrimaryCurrency(marketConfig?: MarketConfig): string {
    return (marketConfig ?? marketConfigService.getCurrentMarketConfig()).defaultCurrency;
  },

  isCurrencySupported(currency: string, marketConfig?: MarketConfig): boolean {
    const normalized = normalizeCurrencyCode(currency);
    if (!normalized) return false;
    const config = marketConfig ?? marketConfigService.getCurrentMarketConfig();
    return config.supportedCurrencies.includes(normalized);
  },

  /**
   * Resolves a requested currency against the active market's allowed currencies.
   * Fails closed to the market primary currency on invalid or unsupported codes.
   */
  resolveMarketCurrency(
    requestedCurrency?: string | null,
    marketConfig?: MarketConfig
  ): SafeCurrencyResolution {
    const config = marketConfig ?? marketConfigService.getCurrentMarketConfig();
    const primary = config.defaultCurrency;

    if (!requestedCurrency || requestedCurrency.trim() === '') {
      return {
        currency: primary,
        supported: true,
        fallbackApplied: false,
        reasonCode: 'OK',
      };
    }

    const normalized = normalizeCurrencyCode(requestedCurrency);
    if (!normalized) {
      return {
        currency: primary,
        supported: false,
        fallbackApplied: true,
        reasonCode: 'INVALID_CURRENCY_FALLBACK',
      };
    }

    if (!config.supportedCurrencies.includes(normalized)) {
      return {
        currency: primary,
        supported: false,
        fallbackApplied: true,
        reasonCode: 'UNSUPPORTED_MARKET_CURRENCY_FALLBACK',
      };
    }

    return {
      currency: normalized,
      supported: true,
      fallbackApplied: false,
      reasonCode: 'OK',
    };
  },

  formatPrice(amount: number, forceCurrency?: string, marketConfig?: MarketConfig): string {
    const config = marketConfig ?? marketConfigService.getCurrentMarketConfig();
    const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    const currency = this.resolveMarketCurrency(forceCurrency, config).currency;
    const locale = config.defaultLocale || 'tr-TR';

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(safeAmount);
    } catch {
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: config.defaultCurrency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(safeAmount);
      } catch {
        return `${safeAmount.toFixed(2)} ${config.defaultCurrency}`;
      }
    }
  },

  formatMinorUnits(minorUnits: number, forceCurrency?: string, marketConfig?: MarketConfig): string {
    const safeMinor = typeof minorUnits === 'number' && Number.isFinite(minorUnits) ? minorUnits : 0;
    return this.formatPrice(safeMinor / 100, forceCurrency, marketConfig);
  },

  /**
   * Honest 0-TL boundary: no live FX oracle is active; cross-currency conversion
   * remains DISABLED_EXTERNAL_HOLD.
   */
  getFxConversionAvailability(): FxConversionAvailability {
    return {
      supported: false,
      availabilityTier: 'DISABLED_EXTERNAL_HOLD',
      reasonCode: 'FX_ORACLE_EXTERNAL_HOLD',
      message: 'Live cross-currency FX conversion requires an external rate provider (EXTERNAL_HOLD).',
    };
  },
};
