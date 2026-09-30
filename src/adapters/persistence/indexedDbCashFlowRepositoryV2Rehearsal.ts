import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import {
  assertV2RevisionTransition,
  assertV2WorkspaceOwnership,
  type CashFlowRepositoryV2,
} from "../../domain/v2/repositoryV2";
import { validateWorkspaceV2 } from "../../domain/v2/validationV2";

const RESERVED_PRODUCTION_DB_NAME = "civilbonus-hcf";
const REHEARSAL_DB_VERSION = 1;
const STORE = "workspaces-v2";

interface WorkspaceRecordV2 extends CashFlowWorkspaceV2 {
  storageKey: string;
}

function storageKey(ownerPartitionId: string, workspaceId: string): string {
  return `${ownerPartitionId}::${workspaceId}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export class RehearsalDatabaseNameError extends Error {}

export class IndexedDbCashFlowRepositoryV2Rehearsal implements CashFlowRepositoryV2 {
  private readonly dbPromise: Promise<IDBDatabase>;

  constructor(databaseName: string, indexedDb: IDBFactory = indexedDB) {
    if (!databaseName.trim()) {
      throw new RehearsalDatabaseNameError("A dedicated rehearsal database name is required.");
    }
    if (databaseName === RESERVED_PRODUCTION_DB_NAME) {
      throw new RehearsalDatabaseNameError(
        "The production HCF database name is reserved and cannot be used by the v2 rehearsal repository.",
      );
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, REHEARSAL_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "storageKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open HCF v2 rehearsal database."));
      request.onblocked = () =>
        reject(new Error("HCF v2 rehearsal database is blocked by another open tab."));
    });
  }

  async load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspaceV2 | null> {
    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readonly");
    const record = await requestResult(
      transaction
        .objectStore(STORE)
        .get(storageKey(ownerPartitionId, workspaceId)) as IDBRequest<
        WorkspaceRecordV2 | undefined
      >,
    );
    await transactionComplete(transaction);

    if (!record) return null;
    const { storageKey: _storageKey, ...workspace } = record;
    return structuredClone(workspace);
  }

  async save(
    ownerPartitionId: string,
    workspace: CashFlowWorkspaceV2,
    expectedRevision: number | null,
  ): Promise<void> {
    assertV2WorkspaceOwnership(workspace, ownerPartitionId);
    validateWorkspaceV2(workspace);

    const db = await this.dbPromise;
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const key = storageKey(ownerPartitionId, workspace.workspaceId);
    const currentRecord = await requestResult(
      store.get(key) as IDBRequest<WorkspaceRecordV2 | undefined>,
    );

    let current: CashFlowWorkspaceV2 | null = null;
    if (currentRecord) {
      const { storageKey: _storageKey, ...existing } = currentRecord;
      current = existing;
    }

    assertV2RevisionTransition(current, workspace, expectedRevision);

    const record: WorkspaceRecordV2 = {
      ...structuredClone(workspace),
      storageKey: key,
    };
    store.put(record);
    await transactionComplete(transaction);
  }
}
