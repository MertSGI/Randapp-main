import { mockProvider } from './mockDataProvider';
import { supabaseProvider } from './supabaseDataProvider';

export interface DataProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  getList<T>(key: string): Promise<T[]>;
  remove(key: string): Promise<void>;
}

export const getDataProvider = (): DataProvider => {
  let mode = 'mock';
  try {
    mode = (import.meta as any).env?.VITE_DATA_MODE || 'mock';
  } catch(e) {
    // Expected in Node harness
  }
  if (mode === 'supabase') {
    return supabaseProvider;
  }
  return mockProvider;
};

export const dataProvider = getDataProvider();
