import { User } from '../types';
import { supabase } from './supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { mapSupabaseProfileToUser, SUPABASE_AUTH_PROFILE_ERROR } from './authProfileMapper';
import { resolveDataSourceMode } from './dataSourceModeResolver';

// Helper mock user for development
const MOCK_ADMIN_USER: User = {
  id: 'user_admin',
  tenantId: 'tenant_demo',
  name: 'Demo Admin',
  email: 'admin@randevulari.com', // mock email
  role: 'tenant_owner',
  active: true,
};

const MOCK_SUPER_ADMIN_USER: User = {
  id: 'user_super_admin',
  tenantId: 'system',
  name: 'Super Admin',
  email: 'superadmin@randevulari.com', // mock email
  role: 'super_admin',
  active: true,
};

function getValidatedMode(): string {
  const env = (globalThis as any).import?.meta?.env || (import.meta as any).env || process.env || {};
  resolveDataSourceMode({
    dataMode: env.VITE_DATA_MODE,
    legacyDataSource: env.VITE_LARI_DATA_SOURCE,
    supabaseUrlPresent: !!env.VITE_SUPABASE_URL,
    supabaseAnonKeyPresent: !!env.VITE_SUPABASE_ANON_KEY
  });
  return (env.VITE_DATA_MODE || '').trim();
}

function getSupabaseClient() {
  const env = (globalThis as any).import?.meta?.env || (import.meta as any).env || process.env || {};
  const supabaseUrl = env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || 'mock-anon-key';
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args: any[]) => (globalThis as any).fetch(...args) }
  });
}

export const authService = {
  async login(email: string, passwordHash: string): Promise<User | null> {
    const mode = getValidatedMode();
    if (mode === 'supabase_staging' || mode === 'supabase_production') {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password: passwordHash, // In real impl, Supabase expects plain password here. We map it to password field.
      });
      if (error || !data.user) {
        console.error('Supabase login error', error);
        return null;
      }
      
      const { data: profile, error: profileError } = await client
        .from('users_profile')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (profileError || !profile) {
        console.error('Supabase profile lookup failed for authenticated user.');
        await client.auth.signOut();
        return null;
      }

      try {
        return mapSupabaseProfileToUser(data.user, profile, email);
      } catch (err) {
        console.error(SUPABASE_AUTH_PROFILE_ERROR, err);
        await client.auth.signOut();
        return null;
      }
    }
    
    // Mock mode logic
    return new Promise(resolve => {
      setTimeout(() => {
        if (email === 'superadmin@randevulari.com' && passwordHash === 'superadmin123') {
          localStorage.setItem('lari_active_owner_session', JSON.stringify(MOCK_SUPER_ADMIN_USER));
          resolve(MOCK_SUPER_ADMIN_USER);
        } else if (passwordHash === 'admin123') {
          localStorage.setItem('lari_active_owner_session', JSON.stringify(MOCK_ADMIN_USER));
          resolve(MOCK_ADMIN_USER);
        } else {
          resolve(null);
        }
      }, 500);
    });
  },

  async logout(): Promise<void> {
    const mode = getValidatedMode();
    if (mode === 'supabase_staging' || mode === 'supabase_production') {
      const client = getSupabaseClient();
      await client.auth.signOut();
      return;
    }
    
    localStorage.removeItem('nexus_admin_auth');
    localStorage.removeItem('lari_mock_user');
    localStorage.removeItem('lari_active_owner_session');
  },

  async getCurrentUser(): Promise<User | null> {
    const mode = getValidatedMode();
    if (mode === 'supabase_staging' || mode === 'supabase_production') {
      const client = getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      
      const { data: profile, error: profileError } = await client
        .from('users_profile')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (profileError || !profile) {
        console.error('Supabase profile lookup failed for authenticated user.');
        return null;
      }

      try {
        return mapSupabaseProfileToUser(data.user, profile);
      } catch (err) {
        console.error(SUPABASE_AUTH_PROFILE_ERROR, err);
        return null;
      }
    }
    
    const mockUserStr = localStorage.getItem('lari_active_owner_session') || localStorage.getItem('lari_mock_user');
    if (mockUserStr) {
      try {
        return JSON.parse(mockUserStr) as User;
      } catch (e) {
        console.error('Failed to parse mock user', e);
      }
    }
    
    // Fallback for legacy mock auth
    const isAuth = localStorage.getItem('nexus_admin_auth');
    if (isAuth === 'super_admin') {
      return MOCK_SUPER_ADMIN_USER;
    } else if (isAuth === 'sandbox_owner' || isAuth === 'true') {
      return MOCK_ADMIN_USER;
    }
    return null;
  }
};
