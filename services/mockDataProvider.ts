import { DataProvider } from './dataProvider';

export const mockProvider: DataProvider = {
  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const item = localStorage.getItem(key);
        resolve(item ? JSON.parse(item) : null);
      }, 50); // slight simulated delay
    });
  },

  async getList<T>(key: string): Promise<T[]> {
    const data = await mockProvider.get<T[]>(key);
    return data || [];
  },

  async set<T>(key: string, value: T): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        localStorage.setItem(key, JSON.stringify(value));
        resolve();
      }, 50);
    });
  },

  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        localStorage.removeItem(key);
        resolve();
      }, 50);
    });
  },
};
