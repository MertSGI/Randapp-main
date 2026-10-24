export { getDataSourceMode } from '../dataSourceConfig';
import { getDataSourceMode } from '../dataSourceConfig';

// This is a stub for the Supabase client.
// It relies on @supabase/supabase-js, but we'll use a type-safe stub until the app
// fully cuts over to Supabase and installs the dependency.
// Actual operations should only run if VITE_LARI_DATA_SOURCE=supabase.

export const getSupabaseClientConfig = () => {
  const env = (import.meta as any).env || (globalThis as any).import?.meta?.env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const supabaseUrl = env.VITE_SUPABASE_URL || '';
  const supabaseKey = env.VITE_SUPABASE_ANON_KEY || '';
  
  if (getDataSourceMode() === 'supabase' && (!supabaseUrl || !supabaseKey)) {
    console.warn('Supabase mode active but credentials missing. Remote operations will fail closed.');
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
    'Authorization': `Bearer ${supabaseKey}`, // Default: anon key; overridden if session exists
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  } as Record<string, string>;

  // Read auth session from Supabase's project-specific localStorage key
  try {
    const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
    const sessionRaw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      const accessToken = session?.access_token;
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }
  } catch (_) {
    // Ignore session read failures; proceed with anon key
  }

  return fetch(url, { ...options, headers });
};
