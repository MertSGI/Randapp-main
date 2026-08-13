import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Do not put Service Role Keys in the frontend!
// Service Role Keys bypass RLS (Row Level Security) and must only exist on backend/serverless/edge functions.
// Use VITE_SUPABASE_ANON_KEY for frontend authentication, which safely interacts with RLS.

// Polyfill WebSocket for Node.js test runner environments
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class MockWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}

// Safely get env vars
let env: any = {};
try { env = (import.meta as any).env || (globalThis as any).import?.meta?.env || {}; } catch(e) {}

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
