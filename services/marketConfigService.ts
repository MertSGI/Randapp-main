export type MarketId = 'tr' | 'global';

export interface MarketConfig {
    marketId: MarketId;
    marketName: string;
    brandName: string;
    productName: string;
    parentBrand?: string;
    visibleBrandName: string;
    domainBrandName: string;
    seoProductName: string;
    localizedDomainLabel: string;
    companyName: string;
    defaultLanguage: 'tr' | 'en';
    supportedLanguages: string[];
    defaultCurrency: string;
    supportedCurrencies: string[];
    defaultCountry: string;
    defaultLocale: string;
    primaryDomain: string;
    appDomain: string;
    bookingDomainPattern: string;
    paymentProvider: 'iyzico' | 'provider_agnostic' | 'stripe_ready_placeholder';
    legalFramework: string;
    supportEmail: string;
    salesContactMode: 'whatsapp' | 'email' | 'form';
    trialDayCount: number;
    requiresPaymentMethod: boolean;
    publicBrandTagline: string;
    logoText: string;
    visibleLogoText: string;
}

export const marketConfigs: Record<MarketId, MarketConfig> = {
    tr: {
        marketId: 'tr',
        marketName: 'Türkiye',
        brandName: 'LARİ',
        productName: 'LARİ',
        visibleBrandName: 'LARİ',
        domainBrandName: 'randevulari',
        seoProductName: 'RandevuLari',
        localizedDomainLabel: 'randevulari.com',
        parentBrand: 'LARİ',
        companyName: 'Lari Teknoloji',
        defaultLanguage: 'tr',
        supportedLanguages: ['tr', 'en'],
        defaultCurrency: 'TRY',
        supportedCurrencies: ['TRY'],
        defaultCountry: 'TR',
        defaultLocale: 'tr-TR',
        primaryDomain: 'randevulari.com',
        appDomain: 'app.randevulari.com',
        bookingDomainPattern: '{tenant}.randevulari.com',
        paymentProvider: 'iyzico',
        legalFramework: 'KVKK',
        supportEmail: 'destek@randevulari.com',
        salesContactMode: 'whatsapp',
        trialDayCount: 14,
        requiresPaymentMethod: true,
        publicBrandTagline: 'İşletmeniz için akıllı randevu sistemi.',
        logoText: 'LARİ',
        visibleLogoText: 'LARİ'
    },
    global: {
        marketId: 'global',
        marketName: 'Global',
        brandName: 'LARİ',
        productName: 'LARİ',
        visibleBrandName: 'LARİ',
        domainBrandName: 'lari',
        seoProductName: 'LARİ',
        localizedDomainLabel: 'lari.app',
        companyName: 'Lari Global',
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'tr'],
        defaultCurrency: 'USD',
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        defaultCountry: 'US',
        defaultLocale: 'en-US',
        primaryDomain: 'lari.app',
        appDomain: 'app.lari.app',
        bookingDomainPattern: '{tenant}.lari.app',
        paymentProvider: 'provider_agnostic',
        legalFramework: 'GDPR-ready',
        supportEmail: 'support@lari.app',
        salesContactMode: 'form',
        trialDayCount: 14,
        requiresPaymentMethod: true,
        publicBrandTagline: 'Smart booking engine for service businesses.',
        logoText: 'LARİ',
        visibleLogoText: 'LARİ'
    }
};

let activeMarketCache: MarketConfig | null = null;

export const marketConfigService = {
    getCurrentMarketConfig(): MarketConfig {
        if (activeMarketCache) return activeMarketCache;
        
        // 1. Check ENV (VITE_LARI_MARKET)
        const envMarket = (import.meta as any).env?.VITE_LARI_MARKET as MarketId | undefined;
        if (envMarket && marketConfigs[envMarket]) {
            activeMarketCache = marketConfigs[envMarket];
            return activeMarketCache;
        }

        // 2. Check hostname if available
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname.includes('randevulari.com')) {
                activeMarketCache = marketConfigs.tr;
                return activeMarketCache;
            }
            if (hostname.includes('lari.app')) {
                activeMarketCache = marketConfigs.global;
                return activeMarketCache;
            }
        }

        // 3. Fallback
        activeMarketCache = marketConfigs.tr;
        return activeMarketCache;
    },

    getBrandName(): string {
        return this.getCurrentMarketConfig().brandName;
    },

    getDefaultLocale(): string {
        return this.getCurrentMarketConfig().defaultLocale;
    },

    getDefaultCurrency(): string {
        return this.getCurrentMarketConfig().defaultCurrency;
    },

    getSupportedLanguages(): string[] {
        return this.getCurrentMarketConfig().supportedLanguages;
    },

    isTurkeyMarket(): boolean {
        return this.getCurrentMarketConfig().marketId === 'tr';
    },

    isGlobalMarket(): boolean {
        return this.getCurrentMarketConfig().marketId === 'global';
    }
};
