import type { CashFlowRepository, CashFlowWorkspace } from "../../domain/cashFlow";

const DB_NAME = "civilbonus-hcf";
const DB_VERSION = 1;
const STORE = "workspaces";

interface WorkspaceRecord extends CashFlowWorkspace {
  storageKey: string;
}

function storageKey(ownerPartitionId: string, workspaceId: string): string {
  return `${ownerPartitionId}::${workspaceId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export class IndexedDbCashFlowRepository implements CashFlowRepository {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory = indexedDB) {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "storageKey" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open HCF local database."));
      request.onblocked = () => reject(new Error("HCF local database upgrade is blocked by another open tab."));
    });
  }

  async load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspace | null> {
    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readonly");
    const record = await requestResult(
      transaction.objectStore(STORE).get(storageKey(ownerPartitionId, workspaceId)) as IDBRequest<WorkspaceRecord | undefined>,
    );
    await transactionComplete(transaction);
    if (!record) return null;
    const { storageKey: _storageKey, ...workspace } = record;
    return structuredClone(workspace);
  }

  async save(workspace: CashFlowWorkspace): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readwrite");
    const record: WorkspaceRecord = {
      ...structuredClone(workspace),
      storageKey: storageKey(workspace.ownerPartitionId, workspace.workspaceId),
    };
    transaction.objectStore(STORE).put(record);
    await transactionComplete(transaction);
  }
}
