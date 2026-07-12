import { DataSourceMode } from './dataSourceConfig';

/**
 * Pure configuration resolver for LARI / Randapp data source mode.
 * Enforces canonical resolution rules, validates allowed values, and catches conflicts.
 */
export function resolveDataSourceMode(params: {
  dataMode?: string;
  legacyDataSource?: string;
  supabaseUrlPresent: boolean;
  supabaseAnonKeyPresent: boolean;
}): DataSourceMode {
  const dataMode = (params.dataMode || '').trim();
  const legacyDataSource = (params.legacyDataSource || '').trim();

  // Rule 1: Neither variable exists
  if (!dataMode && !legacyDataSource) {
    throw new Error('Configuration Error: VITE_DATA_MODE is missing. Please configure VITE_DATA_MODE.');
  }

  // Rule 5: Only legacy variable exists
  if (!dataMode && legacyDataSource) {
    throw new Error('Configuration Error: Legacy environment configuration VITE_LARI_DATA_SOURCE is defined, but canonical VITE_DATA_MODE is missing. Please define VITE_DATA_MODE.');
  }

  // Rule 4: Both variables exist with different values
  if (dataMode && legacyDataSource && dataMode !== legacyDataSource) {
    throw new Error(`Configuration Error: Conflict detected. VITE_DATA_MODE is "${dataMode}" but legacy VITE_LARI_DATA_SOURCE is "${legacyDataSource}". Please set VITE_DATA_MODE and align or remove the legacy variable.`);
  }

  // We now evaluate using the canonical variable dataMode
  const ALLOWED_MODES = ['local', 'mock', 'demo', 'supabase_staging', 'supabase_production'] as const;
  if (!ALLOWED_MODES.includes(dataMode as any)) {
    throw new Error(`Configuration Error: Unrecognized VITE_DATA_MODE value: "${dataMode}". Recognized values are: ${ALLOWED_MODES.join(', ')}.`);
  }

  if (dataMode === 'supabase_staging' || dataMode === 'supabase_production') {
    if (!params.supabaseUrlPresent || !params.supabaseAnonKeyPresent) {
      throw new Error(`Configuration Error: Data mode is configured for "${dataMode}", but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.`);
    }
    return 'supabase';
  }

  return 'local';
}
