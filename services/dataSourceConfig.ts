export type DataSourceMode = 'local' | 'supabase';

export const getDataSourceMode = (): DataSourceMode => {
  const meta = import.meta as any;
  const envMode = meta.env?.VITE_LARI_DATA_SOURCE || meta.env?.VITE_DATA_MODE || 'local';
  
  if (envMode === 'supabase' || envMode.startsWith('supabase_')) {
    // If Supabase config is missing, fallback to local
    const supabaseUrl = meta.env?.VITE_SUPABASE_URL;
    const supabaseAnonKey = meta.env?.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Data mode is configured for Supabase, but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Falling back to local mode.');
      return 'local';
    }
    return 'supabase';
  }
  
  return 'local';
};

export const dataSourceConfig = {
  mode: getDataSourceMode()
};
