import { resolveDataSourceMode } from './dataSourceModeResolver';

export type DataSourceMode = 'local' | 'supabase';

export const getDataSourceMode = (): DataSourceMode => {
  const env = (import.meta as any).env || (globalThis as any).import?.meta?.env || {};
  return resolveDataSourceMode({
    dataMode: env.VITE_DATA_MODE,
    legacyDataSource: env.VITE_LARI_DATA_SOURCE,
    supabaseUrlPresent: !!env.VITE_SUPABASE_URL,
    supabaseAnonKeyPresent: !!env.VITE_SUPABASE_ANON_KEY
  });
};

export const dataSourceConfig = {
  get mode(): DataSourceMode {
    return getDataSourceMode();
  }
};
