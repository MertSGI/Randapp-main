import { getDataSourceMode } from '../dataSourceConfig';

// This is a stub for the Supabase client.
// It relies on @supabase/supabase-js, but we'll use a type-safe stub until the app
// fully cuts over to Supabase and installs the dependency.
// Actual operations should only run if VITE_LARI_DATA_SOURCE=supabase.

export const getSupabaseClientConfig = () => {
  const meta = import.meta as any;
  const supabaseUrl = (meta.env?.VITE_SUPABASE_URL as string) || '';
  const supabaseKey = (meta.env?.VITE_SUPABASE_ANON_KEY as string) || '';
  
  if (getDataSourceMode() === 'supabase' && (!supabaseUrl || !supabaseKey)) {
    console.warn('Supabase mode active but credentials missing. Will fallback to local/mock operations where possible.');
  }

  return { supabaseUrl, supabaseKey };
};

// Provides a simple fetch wrapper to mock Supabase client-like interface for now
// so we don't break the build if @supabase/supabase-js is not installed yet.
export const fetchSupabase = async (path: string, options: RequestInit = {}) => {
  const { supabaseUrl, supabaseKey } = getSupabaseClientConfig();
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase client is not configured.');
  }

  const url = `${supabaseUrl}${path}`;
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`, // Overridden below if token exists
    ...(options.headers || {})
  } as Record<string, string>;

  // Basic attempt to get a local auth session token if exists
  const localToken = localStorage.getItem('sb-access-token');
  if (localToken) {
    headers['Authorization'] = `Bearer ${localToken}`;
  }

  return fetch(url, { ...options, headers });
};
