export type PaymentRunMode = 'local_dry_run' | 'sandbox_live' | 'production_live';

export interface RunModeStatus {
    mode: PaymentRunMode;
    label: string;
    description: string;
    canRunCheckout: boolean;
    isPaymentCollectionAuthorized: boolean;
    isMockSimulation: boolean;
    missingBlockers: string[];
}

export class PaymentRunModeService {
    /**
     * Determines current operational run mode.
     * BINDING SAFETY RULE: Browser localStorage, URL parameters, and client-side flags
     * CANNOT grant payment collection authority.
     */
    public getCurrentMode(): PaymentRunMode {
        const env = (typeof process !== 'undefined' ? process.env : {}) as any;
        const metaEnv = ((import.meta as any).env || {}) as any;
        const configuredMode = metaEnv.VITE_PAYMENT_RUN_MODE || env.VITE_PAYMENT_RUN_MODE;

        if (configuredMode === 'production_live') {
            return 'production_live';
        }
        if (configuredMode === 'sandbox_live') {
            return 'sandbox_live';
        }

        // Internal UI diagnostic preview in local storage is strictly constrained to local rehearsal:
        // Attempting to set 'production_live' in localStorage is rejected and ignored.
        const lsMode = (typeof localStorage !== 'undefined') ? localStorage.getItem('internal_run_mode') : null;
        if (lsMode === 'sandbox_live') {
            return 'sandbox_live';
        }

        return 'local_dry_run';
    }

    public setInternalDiagnosticsMode(mode: PaymentRunMode) {
        if (typeof localStorage === 'undefined') return;
        
        // SECURITY GATE: Prevent localStorage tampering from claiming production_live
        if (mode === 'production_live') {
            console.warn('[SECURITY] Browser localStorage is prohibited from activating production_live payment mode. Falling back to local_dry_run.');
            localStorage.removeItem('internal_run_mode');
            return;
        }

        if (mode === 'local_dry_run') {
            localStorage.removeItem('internal_run_mode');
        } else if (mode === 'sandbox_live') {
            localStorage.setItem('internal_run_mode', 'sandbox_live');
        }
    }

    /**
     * Returns the authoritative status of the payment subsystem.
     * Enforces fail-closed rules:
     * - production_live: canRunCheckout is strictly FALSE in frontend (requires backend attestation and production release gate).
     * - sandbox_live: canRunCheckout is strictly FALSE unless verified sandbox backend credentials are confirmed.
     * - local_dry_run: canRunCheckout is FALSE for real money; allows safe simulated UI dry-run only.
     */
    public getStatus(options?: { hasVerifiedBackendConfig?: boolean; blockers?: string[] } | number): RunModeStatus {
        const mode = this.getCurrentMode();
        let blockers: string[] = [];
        let hasVerifiedBackend = false;
        if (typeof options === 'number') {
            if (options > 0) {
                blockers = [`System reported ${options} unresolved blockers`];
            }
        } else if (options) {
            blockers = options.blockers || [];
            hasVerifiedBackend = !!options.hasVerifiedBackendConfig;
        }

        switch (mode) {
            case 'production_live':
                // Production live collection CANNOT be authorized from browser client state.
                return {
                    mode: 'production_live',
                    label: 'Production Live (Kilitli / Backend Doğrulaması Gerekli)',
                    description: 'Canlı ödeme tahsilatı tarayıcı üzerinden yetkilendirilemez. Sunucu tarafı doğrulama ve sürüm onayı gereklidir.',
                    canRunCheckout: false,
                    isPaymentCollectionAuthorized: false,
                    isMockSimulation: false,
                    missingBlockers: [
                        'Sunucu tarafı doğrulanmış Iyzico PROD konfigürasyonu ve canlı onay belgesi mevcut değil.',
                        'Issue #10 Prodüksiyon Yayın Engeli henüz çözülmedi.',
                        ...blockers
                    ]
                };

            case 'sandbox_live':
                const sandboxReady = hasVerifiedBackend && blockers.length === 0;
                return {
                    mode: 'sandbox_live',
                    label: 'Sandbox Rehearsal (Test)',
                    description: 'Iyzico Sandbox ortamı provası. Gerçek para tahsilatı yapılmaz.',
                    canRunCheckout: sandboxReady,
                    isPaymentCollectionAuthorized: false,
                    isMockSimulation: false,
                    missingBlockers: sandboxReady ? [] : [
                        'Sandbox API anahtarları veya Edge Function entegrasyonu doğrulanmadı.',
                        ...blockers
                    ]
                };

            case 'local_dry_run':
            default:
                return {
                    mode: 'local_dry_run',
                    label: 'Local Dry Run (Simülasyon)',
                    description: 'Yerel UI akış provası. Harici ödeme altyapısına bağlanılmaz, hiçbir kart veya para işlemi yapılamaz.',
                    canRunCheckout: false,
                    isPaymentCollectionAuthorized: false,
                    isMockSimulation: true,
                    missingBlockers: []
                };
        }
    }

    /**
     * Simulates safe UI handoff for local rehearsal without contacting external services or manufacturing paid subscriptions.
     */
    public simulateCheckoutHandoff(tenantId: string, planId: string, _triggerUrl?: string): string {
        console.warn(`[PaymentRunMode: local_dry_run] Simulating UI rehearsal internally for tenant ${tenantId}, plan: ${planId}`);
        const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'https://lari.app';
        return `${origin}/#/admin?tab=abonelik&checkout_simulate=true`;
    }
}

export const paymentRunModeService = new PaymentRunModeService();
