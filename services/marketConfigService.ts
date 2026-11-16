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

export interface MarketResolutionOptions {
    envMarket?: string | null;
    hostname?: string | null;
    fallbackMarket?: MarketId;
}

export function isValidMarketId(value: unknown): value is MarketId {
    return value === 'tr' || value === 'global';
}

export function getSupportedMarkets(): MarketId[] {
    return ['tr', 'global'];
}

function normalizeHostname(hostname: string | null | undefined): string {
    if (typeof hostname !== 'string') return '';
    return hostname.trim().toLowerCase().split(':')[0];
}

function matchesDomain(hostname: string, domain: string): boolean {
    if (!hostname) return false;
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

function readRuntimeEnvMarket(): string | undefined {
    try {
        const importMetaEnv = (import.meta as any)?.env;
        if (importMetaEnv?.VITE_LARI_MARKET) {
            return String(importMetaEnv.VITE_LARI_MARKET);
        }
    } catch {
        // ignore
    }
    const globalImportEnv = (globalThis as any)?.import?.meta?.env;
    if (globalImportEnv?.VITE_LARI_MARKET) {
        return String(globalImportEnv.VITE_LARI_MARKET);
    }
    const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    if (nodeEnv?.VITE_LARI_MARKET) {
        return String(nodeEnv.VITE_LARI_MARKET);
    }
    return undefined;
}

/**
 * Pure, deterministic market resolver with safe domain-suffix matching and fail-closed fallback.
 */
export function resolveMarketConfig(options?: MarketResolutionOptions): MarketConfig {
    const rawEnvMarket = options?.envMarket !== undefined ? options.envMarket : readRuntimeEnvMarket();
    const normalizedEnv = typeof rawEnvMarket === 'string' ? rawEnvMarket.trim().toLowerCase() : '';
    if (isValidMarketId(normalizedEnv)) {
        return marketConfigs[normalizedEnv];
    }

    const rawHostname =
        options?.hostname !== undefined
            ? options.hostname
            : typeof window !== 'undefined' && window.location
              ? window.location.hostname
              : '';
    const hostname = normalizeHostname(rawHostname);

    if (matchesDomain(hostname, 'randevulari.com')) {
        return marketConfigs.tr;
    }
    if (matchesDomain(hostname, 'lari.app')) {
        return marketConfigs.global;
    }

    const fallback = isValidMarketId(options?.fallbackMarket) ? options.fallbackMarket : 'tr';
    return marketConfigs[fallback];
}

let activeMarketCache: MarketConfig | null = null;

export const marketConfigService = {
    resetCache(): void {
        activeMarketCache = null;
    },

    resolveMarketConfig,

    getMarketConfig(marketId: MarketId): MarketConfig {
        return isValidMarketId(marketId) ? marketConfigs[marketId] : marketConfigs.tr;
    },

    getCurrentMarketConfig(): MarketConfig {
        if (activeMarketCache) return activeMarketCache;
        activeMarketCache = resolveMarketConfig();
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
        return [...this.getCurrentMarketConfig().supportedLanguages];
    },

    isTurkeyMarket(): boolean {
        return this.getCurrentMarketConfig().marketId === 'tr';
    },

    isGlobalMarket(): boolean {
        return this.getCurrentMarketConfig().marketId === 'global';
    }
};
