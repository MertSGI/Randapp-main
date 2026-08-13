// test-setup-env.mjs
// Test environment boundary setup and polyfills for Node.js test runners

process.env.VITE_DATA_MODE = 'supabase_staging';
process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class MockWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {}
  };
}
