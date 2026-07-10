export interface DiagnosticResponse {
  functionName?: string;
  mode: string;
  requiredEnvPresent?: Record<string, boolean>;
  missingEnvNames?: string[];
  timestamp?: string;
  canProceed?: boolean;
  message?: string;
  error?: string;
}

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

export const paymentDiagnosticsService = {
  getFrontendEnvironmentInfo() {
    return {
      paymentProvider: import.meta.env.VITE_PAYMENT_PROVIDER || 'mock',
      dataMode: import.meta.env.VITE_DATA_MODE || 'mock',
      supabaseUrlConfigured: !!import.meta.env.VITE_SUPABASE_URL,
      edgeFunctionBase: EDGE_FUNCTION_BASE,
      noFrontendSecretsExposed: !import.meta.env['VITE_IYZICO_SECRET_KEY'] && !import.meta.env['VITE_SUPABASE_SECRET_ROLE_KEY'] && !import.meta.env['VITE_SUPABASE_SERVICE_ROLE_KEY']
    };
  },

  async runFunctionDiagnostic(functionName: string): Promise<DiagnosticResponse> {
    if (!EDGE_FUNCTION_BASE) {
      return {
        mode: 'sandbox_not_configured',
        canProceed: false,
        message: 'Edge Function Base URL is missing. Set VITE_SUPABASE_URL.',
        missingEnvNames: ['VITE_SUPABASE_URL']
      };
    }

    try {
      const res = await fetch(`${EDGE_FUNCTION_BASE}/${functionName}`, {
        method: 'POST',
        headers: {
           'Content-Type': 'application/json',
           // If we have anon key, we'd add it here, but edge fn should handle parsing body openly for diagnostics
        },
        body: JSON.stringify({ diagnostic: true })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      return data;
    } catch (error: any) {
      return {
        mode: 'error',
        canProceed: false,
        error: error.message,
        message: `Could not reach Edge Function ${functionName}`,
      };
    }
  }
};
