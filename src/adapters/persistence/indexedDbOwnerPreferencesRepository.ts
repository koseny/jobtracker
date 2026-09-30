import {
  assertOwnerPreferencesRevisionTransition,
  type OwnerPreferences,
  type OwnerPreferencesRepository,
  validateOwnerPreferences,
} from "../../domain/ownerPreferences";

const DB_NAME = "civilbonus-hcf-preferences";
const DB_VERSION = 1;
const STORE = "owner-preferences";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB preference request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB preference transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB preference transaction aborted."));
  });
}

export class IndexedDbOwnerPreferencesRepository implements OwnerPreferencesRepository {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory = indexedDB) {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "ownerPartitionId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open HCF preference database."));
      request.onblocked = () =>
        reject(new Error("HCF preference database is blocked by another open tab."));
    });
  }

  async load(ownerPartitionId: string): Promise<OwnerPreferences | null> {
    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readonly");
    const value = await requestResult(
      transaction.objectStore(STORE).get(ownerPartitionId) as IDBRequest<
        OwnerPreferences | undefined
      >,
    );
    await transactionComplete(transaction);
    return value ? structuredClone(value) : null;
  }

  async save(
    preferences: OwnerPreferences,
    expectedRevision: number | null,
  ): Promise<void> {
    validateOwnerPreferences(preferences);

    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const current = await requestResult(
      store.get(preferences.ownerPartitionId) as IDBRequest<
        OwnerPreferences | undefined
      >,
    );

    assertOwnerPreferencesRevisionTransition(
      current ?? null,
      preferences,
      expectedRevision,
    );

    store.put(structuredClone(preferences));
    await transactionComplete(transaction);
  }
}
