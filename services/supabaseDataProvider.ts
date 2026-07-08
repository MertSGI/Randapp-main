import { DataProvider } from './dataProvider';
import { supabase } from './supabaseClient';

// This is a scaffold for the Supabase data provider.
// Rather than providing generic key/value endpoints, we throw an error here 
// to enforce that domain services (like appointmentService) directly use 
// Supabase table methods when VITE_DATA_MODE=supabase.
// Do not rely on translating keys like 'randapp:tenant:appointments' into database tables for production.

export const supabaseProvider: DataProvider = {
  async get<T>(key: string): Promise<T | null> {
    throw new Error(`Not implemented: Use domain-specific services for Supabase mode (key: ${key})`);
  },

  async getList<T>(key: string): Promise<T[]> {
    throw new Error(`Not implemented: Use domain-specific services for Supabase mode (key: ${key})`);
  },

  async set<T>(key: string, value: T): Promise<void> {
    throw new Error(`Not implemented: Use domain-specific services for Supabase mode (key: ${key})`);
  },

  async remove(key: string): Promise<void> {
    throw new Error(`Not implemented: Use domain-specific services for Supabase mode (key: ${key})`);
  },
};
