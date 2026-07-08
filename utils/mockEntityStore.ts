export type MockEntity = { id: string; [key: string]: any };
export type MutationResult<T> = { ok: boolean; action: 'created' | 'updated' | 'deleted' | 'deactivated' | 'error'; data?: T; messageKey?: string };

export function createError<T>(action: MutationResult<T>['action'], messageKey: string): MutationResult<T> {
  return { ok: false, action, messageKey };
}

export function createSuccess<T>(action: MutationResult<T>['action'], data?: T): MutationResult<T> {
  return { ok: true, action, data };
}

export const mockEntityStore = {
  readCollection<T extends MockEntity>(key: string, fallbackFactory?: () => T[]): T[] {
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error(`Error parsing mock collection ${key}:`, e);
      }
    }
    
    // If not seeded yet and no fallback, return empty
    // We assume caller handles seeding check before calling if needed
    if (fallbackFactory) {
      const fallback = fallbackFactory();
      // Deep clone fallback to prevent memory mutation
      return JSON.parse(JSON.stringify(fallback));
    }
    
    return [];
  },

  writeCollection<T extends MockEntity>(key: string, items: T[]): void {
    localStorage.setItem(key, JSON.stringify(items));
  },

  createItem<T extends MockEntity>(key: string, item: T): MutationResult<T> {
    const collection = mockEntityStore.readCollection<T>(key);
    collection.push(item);
    mockEntityStore.writeCollection(key, collection);
    return createSuccess('created', item);
  },

  updateItem<T extends MockEntity>(key: string, id: string, patch: Partial<T>): MutationResult<T> {
    const collection = mockEntityStore.readCollection<T>(key);
    const index = collection.findIndex(i => i.id === id);
    if (index === -1) return createError('error', 'not_found');
    
    collection[index] = { ...collection[index], ...patch };
    mockEntityStore.writeCollection(key, collection);
    return createSuccess('updated', collection[index]);
  },

  deleteItem<T extends MockEntity>(key: string, id: string): MutationResult<void> {
    const collection = mockEntityStore.readCollection<T>(key);
    const beforeCount = collection.length;
    
    const filtered = collection.filter(i => i.id !== id);
    if (filtered.length === beforeCount) {
      return createError('error', 'not_found');
    }
    
    this.writeCollection(key, filtered);
    return createSuccess('deleted');
  },

  deactivateItem<T extends MockEntity>(key: string, id: string, activeField = 'active'): MutationResult<T> {
    return this.updateItem(key, id, { [activeField]: false } as any);
  }
};
