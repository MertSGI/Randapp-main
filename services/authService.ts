import { User, Role } from '../types';
import { supabase } from './supabaseClient';

// Helper mock user for development
const MOCK_ADMIN_USER: User = {
  id: 'user_admin',
  tenantId: 'tenant_demo',
  name: 'Demo Admin',
  email: 'admin@randapp.com', // mock email
  role: 'tenant_owner',
  active: true,
};

const MOCK_SUPER_ADMIN_USER: User = {
  id: 'user_super_admin',
  tenantId: 'system',
  name: 'Super Admin',
  email: 'superadmin@randapp.com', // mock email
  role: 'super_admin',
  active: true,
};

export const authService = {
  async login(email: string, passwordHash: string): Promise<User | null> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: passwordHash, // In real impl, Supabase expects plain password here. We map it to password field.
      });
      if (error || !data.user) {
        console.error('Supabase login error', error);
        return null;
      }
      
      const { data: profile } = await supabase
        .from('users_profile')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      return {
        id: data.user.id,
        tenantId: profile?.tenant_id || 'tenant_demo', // TODO: strictly derive from profile in prod
        name: profile?.name || data.user.email || 'User',
        email: data.user.email || email,
        role: (profile?.role as Role) || 'tenant_owner', // TODO: strictly derive from profile in prod
        active: profile?.active ?? true,
      };
    }
    
    // Mock mode logic
    return new Promise(resolve => {
      setTimeout(() => {
        if (email === 'superadmin@randapp.com' && passwordHash === 'superadmin123') {
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
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      await supabase.auth.signOut();
      return;
    }
    
    localStorage.removeItem('nexus_admin_auth');
    localStorage.removeItem('randapp_mock_user');
    localStorage.removeItem('lari_active_owner_session');
  },

  async getCurrentUser(): Promise<User | null> {
    const mode = (import.meta as any).env.VITE_DATA_MODE || 'mock';
    if (mode === 'supabase') {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;
      
      const { data: profile } = await supabase
        .from('users_profile')
        .select('*')
        .eq('id', data.user.id)
        .single();

      return {
        id: data.user.id,
        tenantId: profile?.tenant_id || 'tenant_demo', // TODO: strictly derive from profile in prod
        name: profile?.name || data.user.email || 'User',
        email: data.user.email || '',
        role: (profile?.role as Role) || 'tenant_owner', // TODO: strictly derive from profile in prod
        active: profile?.active ?? true,
      };
    }
    
    const mockUserStr = localStorage.getItem('lari_active_owner_session') || localStorage.getItem('randapp_mock_user');
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
