import { marketConfigService } from './marketConfigService';

export const currencyService = {
  getPrimaryCurrency(): string {
    return marketConfigService.getDefaultCurrency();
  },

  formatPrice(amount: number, forceCurrency?: string): string {
    const currency = forceCurrency || this.getPrimaryCurrency();
    const locale = marketConfigService.getDefaultLocale();

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(amount);
  },

  isCurrencySupported(currency: string): boolean {
    const config = marketConfigService.getCurrentMarketConfig();
    return config.supportedCurrencies.includes(currency);
  }
};
