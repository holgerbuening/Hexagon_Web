export const DATABASE_NAME = "hexagon-browser";
export type StoreName = "author" | "campaigns" | "progress" | "tests";
export interface DatabaseWrite { store: StoreName; key: string; value: unknown }
export interface BrowserDatabase {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  all<T>(store: StoreName): Promise<T[]>;
  write(entries: DatabaseWrite[]): Promise<void>;
}

// Resolve writes only after the whole transaction commits, never on request success.
export function createBrowserDatabase(): BrowserDatabase {
  let opening: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        for (const name of ["author", "campaigns", "progress", "tests"]) request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error ?? new Error("Browser database unavailable."));
      request.onblocked = () => reject(new Error("Close other Hexagon tabs and try again."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }
  async function read<T>(store: StoreName, key?: string): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
      tx.oncomplete = () => resolve(request.result as T);
      tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Could not read browser data."));
      tx.onerror = () => {}; // onabort reports transaction failures.
    });
  }
  return {
    get: <T>(store: StoreName, key: string) => read<T | undefined>(store, key),
    all: <T>(store: StoreName) => read<T[]>(store),
    async write(entries) {
      if (!entries.length) return;
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([...new Set(entries.map(e => e.store))], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error("Could not save browser data."));
        tx.onerror = () => {};
        try {
          for (const entry of entries) tx.objectStore(entry.store).put(entry.value, entry.key);
        } catch (error) {
          tx.abort();
          reject(error);
        }
      });
    },
  };
}
export const browserDatabase = createBrowserDatabase();

export interface LegacyStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

// A failed write, readback, or concurrent legacy edit must never delete the original.
export async function migrateLegacyValue<T>(db: BrowserDatabase, storage: LegacyStorage, key: string,
  store: StoreName, destination: string, parse: (value: unknown) => T): Promise<T | undefined> {
  const existing = await db.get<T>(store, destination);
  const raw = storage.getItem(key);
  if (existing !== undefined) {
    // A previous run may have committed but not yet removed its source.
    if (raw !== null && JSON.stringify(parse(JSON.parse(raw))) === JSON.stringify(existing)) storage.removeItem(key);
    return existing;
  }
  if (raw === null) return undefined;
  const value = parse(JSON.parse(raw));
  await db.write([{ store, key: destination, value }]);
  const restored = await db.get<T>(store, destination);
  if (JSON.stringify(restored) !== JSON.stringify(value)) throw new Error("Browser data migration could not be verified.");
  if (storage.getItem(key) === raw) storage.removeItem(key);
  return restored;
}
