export type PaymentRunMode = 'local_dry_run' | 'sandbox_live' | 'production_live';

export interface RunModeStatus {
    mode: PaymentRunMode;
    label: string;
    description: string;
    canRunCheckout: boolean;
    missingBlockers: string[];
}

export class PaymentRunModeService {
    public getCurrentMode(): PaymentRunMode {
        // In a real application, you would determine this based on an environment variable,
        // config setting, or an authenticated Supabase RPC call that returns the active mode.
        // VITE_PAYMENT_RUN_MODE might be defined locally, but generally, we want internal QA to switch it easily if needed (via local storage for now while keeping it strictly internal).
        // Let's assume it defaults to local_dry_run if no other variables are passed.
        
        const envMode = (import.meta as any).env.VITE_PAYMENT_RUN_MODE as PaymentRunMode | undefined;
        if (envMode === 'production_live' || envMode === 'sandbox_live') {
            return envMode;
        }

        const lsMode = localStorage.getItem('internal_run_mode') as PaymentRunMode | null;
        if (lsMode === 'sandbox_live' || lsMode === 'production_live') {
            return lsMode;
        }

        return 'local_dry_run';
    }

    public setInternalDiagnosticsMode(mode: PaymentRunMode) {
        // This should only be exposed via the Super Admin settings
        if (mode === 'local_dry_run') {
            localStorage.removeItem('internal_run_mode');
        } else {
            localStorage.setItem('internal_run_mode', mode);
        }
    }

    public getStatus(blockersCount: number = 0): RunModeStatus {
        const mode = this.getCurrentMode();

        switch (mode) {
            case 'production_live':
                return {
                    mode: 'production_live',
                    label: 'Production Live (Canlı)',
                    description: 'Gerçek Iyzico PROD altyapısı devrede. İşlemler gerçek müşteriler için gerçekleşir.',
                    canRunCheckout: true, // Assuming go-live triggers are passed before this is set
                    missingBlockers: []
                };
            case 'sandbox_live':
                return {
                    mode: 'sandbox_live',
                    label: 'Sandbox Live',
                    description: 'Gerçek Supabase Edge Fonksiyonları kullanılarak Iyzico Sandbox ödeme testi ortamı. Gerçek para akışı olmaz.',
                    canRunCheckout: blockersCount === 0,
                    missingBlockers: blockersCount > 0 ? ['Sandbox kimlik bilgileri ve fonksiyon entegrasyonu tam değil.'] : []
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
        // Return a local URL that handles the simulation state or redirects immediately
        // In real terms, we'd normally want to test the full lifecycle, so let's redirect them back to the Admin Dashboard
        // appending a checkout=success or checkout=cancelled param
        // This is safe because real validation requires Iyzico signature verification and backend validation.
        
        // This function intercepts startCheckout in local_dry_run
        return `${window.location.origin}/#/admin?tab=abonelik&checkout_simulate=true`; // Specific internal route
    }
}

export const paymentRunModeService = new PaymentRunModeService();
