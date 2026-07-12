export type DataSourceMode = 'local' | 'supabase';

const ALLOWED_MODES = ['local', 'mock', 'demo', 'supabase_staging', 'supabase_production'] as const;

export const getDataSourceMode = (): DataSourceMode => {
  const envMode = (import.meta.env?.VITE_LARI_DATA_SOURCE || import.meta.env?.VITE_DATA_MODE || '').trim();
  
  if (!envMode) {
    throw new Error('Configuration Error: VITE_DATA_MODE is missing. Please set VITE_DATA_MODE to one of the recognized values.');
  }

  if (!ALLOWED_MODES.includes(envMode as any)) {
    throw new Error(`Configuration Error: Unrecognized VITE_DATA_MODE value: "${envMode}". Recognized values are: ${ALLOWED_MODES.join(', ')}.`);
  }

  if (envMode === 'supabase_staging' || envMode === 'supabase_production') {
    const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(`Configuration Error: Data mode is configured for "${envMode}", but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.`);
    }
    return 'supabase';
  }
  
  return 'local';
};

export const dataSourceConfig = {
  get mode(): DataSourceMode {
    return getDataSourceMode();
  }
};

