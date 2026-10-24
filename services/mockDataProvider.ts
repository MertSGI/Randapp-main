import { DataProvider } from './dataProvider';

const inMemoryStore = new Map<string, string>();

export const mockProvider: DataProvider = {
  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof localStorage !== 'undefined') {
          const item = localStorage.getItem(key);
          resolve(item ? JSON.parse(item) : null);
        } else {
          const item = inMemoryStore.get(key);
          resolve(item ? JSON.parse(item) : null);
        }
      }, 10); // slight simulated delay
    });
  },

  async getList<T>(key: string): Promise<T[]> {
    const data = await mockProvider.get<T[]>(key);
    return data || [];
  },

  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(value));
        } else {
          inMemoryStore.set(key, JSON.stringify(value));
        }
        resolve();
      }, 10);
    });
  },

  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        } else {
          inMemoryStore.delete(key);
        }
        resolve();
      }, 10);
    });
  },
};
