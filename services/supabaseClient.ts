import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Do not put Service Role Keys in the frontend!
// Service Role Keys bypass RLS (Row Level Security) and must only exist on backend/serverless/edge functions.
// Use VITE_SUPABASE_ANON_KEY for frontend authentication, which safely interacts with RLS.

// Safely get env vars
let env: any = {};
try { env = (globalThis as any).import?.meta?.env || (import.meta as any).env || process.env || {}; } catch(e) {}

const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

