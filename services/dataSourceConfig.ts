import { resolveDataSourceMode } from './dataSourceModeResolver';

export type DataSourceMode = 'local' | 'supabase';

export const getDataSourceMode = (): DataSourceMode => {
  const metaEnv = (import.meta as any).env || {};
  const procEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
  const env = { ...procEnv, ...metaEnv };

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
