import { getDataSourceMode } from './dataSourceConfig';

export type PaymentRunMode = 'local_dry_run' | 'sandbox_live' | 'production_live';

export interface RunModeStatus {
    mode: PaymentRunMode;
    label: string;
    description: string;
    canRunCheckout: boolean;
    missingBlockers: string[];
}

function safeGetLocalStorage(): Storage | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
    } catch {
        // Access denied or not in browser
    }
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage;
        }
    } catch {
        // Access denied or not in browser
    }
    return null;
}

function resolveEnv(): Record<string, any> {
    try {
        if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
            return (import.meta as any).env;
        }
    } catch {
        // ignore
    }
    try {
        if (typeof globalThis !== 'undefined' && (globalThis as any)?.import?.meta?.env) {
            return (globalThis as any).import.meta.env;
        }
    } catch {
        // ignore
    }
    try {
        if (typeof process !== 'undefined' && process?.env) {
            return process.env;
        }
    } catch {
        // ignore
    }
    return {};
}

function isPersistentSupabaseMode(): boolean {
    try {
        if (getDataSourceMode() === 'supabase') {
            return true;
        }
    } catch {
        // fallback to robust env inspection if getDataSourceMode is unconfigured in test
    }
    const env = resolveEnv();
    const mode = env.VITE_DATA_MODE || env.VITE_LARI_DATA_SOURCE;
    return mode === 'supabase' || mode === 'supabase_staging' || mode === 'supabase_production';
}

export class PaymentRunModeService {
    public getCurrentMode(): PaymentRunMode {
        const env = resolveEnv();
        const envMode = env.VITE_PAYMENT_RUN_MODE as PaymentRunMode | undefined;

        // Production live cannot be activated by client environment or client storage alone
        if (envMode === 'sandbox_live') {
            return 'sandbox_live';
        }

        const ls = safeGetLocalStorage();
        const lsMode = ls ? ls.getItem('internal_run_mode') : null;

        // Old or tampered 'production_live' in localStorage is strictly ignored on client
        if (lsMode === 'sandbox_live') {
            return 'sandbox_live';
        }

        return 'local_dry_run';
    }

    public setInternalDiagnosticsMode(mode: PaymentRunMode) {
        if (mode === 'production_live') {
            throw new Error('PRODUCTION_PAYMENT_MODE_DISALLOWED_ON_CLIENT: Production payment mode cannot be enabled from the client.');
        }

        const ls = safeGetLocalStorage();
        if (!ls) {
            return;
        }

        if (mode === 'local_dry_run') {
            ls.removeItem('internal_run_mode');
        } else if (mode === 'sandbox_live') {
            ls.setItem('internal_run_mode', mode);
        } else {
            ls.removeItem('internal_run_mode');
        }
    }

    public getStatus(blockersCount: number = 0): RunModeStatus {
        const mode = this.getCurrentMode();

        // Fail-closed: In persistent Supabase mode, client checkout is strictly prohibited
        if (isPersistentSupabaseMode()) {
            return {
                mode,
                label: 'Aktivasyon Bekliyor (Sunucu Doğrulaması Gerekli)',
                description: 'Kalıcı Supabase veri tabanı modunda canlı ödeme altyapısı aktivasyon bekliyor. İstemci üzerinden ödeme başlatılamaz.',
                canRunCheckout: false,
                missingBlockers: ['SERVER_PAYMENT_ACTIVATION_REQUIRED']
            };
        }

        switch (mode) {
            case 'production_live':
                return {
                    mode: 'production_live',
                    label: 'Production Live (Aktivasyon Bekliyor)',
                    description: 'Gerçek ödeme altyapısı istemci üzerinden açılamaz. Sunucu doğrulaması ve kurumsal onay gereklidir.',
                    canRunCheckout: false,
                    missingBlockers: ['SERVER_PAYMENT_ACTIVATION_REQUIRED', 'Canlı ödeme geçidi istemci üzerinden açılamaz; kurumsal onay gereklidir.']
                };
            case 'sandbox_live':
                return {
                    mode: 'sandbox_live',
                    label: 'Sandbox Live (Sunucu Doğrulaması Gerekli)',
                    description: 'Gerçek Supabase Edge Fonksiyonları kullanılarak Iyzico Sandbox ödeme testi ortamı. Sunucu doğrulaması olmadan istemciden tetiklenemez.',
                    canRunCheckout: false,
                    missingBlockers: ['SERVER_PAYMENT_ACTIVATION_REQUIRED', 'Sandbox checkout sunucu doğrulaması ve Edge fonksiyon entegrasyonu tamamlanana kadar kilitlidir.']
                };
            case 'local_dry_run':
            default:
                return {
                    mode: 'local_dry_run',
                    label: 'Local Dry Run (QA Simülasyonu)',
                    description: 'Sistem yerel QA test modunda çalışır. Dış bağlantı yapılmaz, ödeme ve abonelik senaryoları simüle edilir.',
                    canRunCheckout: true,
                    missingBlockers: []
                };
        }
    }

    /**
     * Executes an internal mock simulation of checkout success/failure/cancel logic
     * Useful for verifying UI paths without contacting any external service
     */
    public simulateCheckoutHandoff(tenantId: string, planId: string, triggerUrl: string): string {
        console.warn(`[PaymentRunMode: local_dry_run] Simulating checkout flow internally for tenant ${tenantId}`);
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost';
        return `${origin}/#/admin?tab=abonelik&checkout_simulate=true`;
    }
}

export const paymentRunModeService = new PaymentRunModeService();
