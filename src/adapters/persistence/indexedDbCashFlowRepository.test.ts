import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import type { CashFlowWorkspace } from "../../domain/cashFlow";
import { IndexedDbCashFlowRepository } from "./indexedDbCashFlowRepository";

function workspace(ownerPartitionId: string, workspaceId = "workspace-1"): CashFlowWorkspace {
  return {
    workspaceId,
    ownerPartitionId,
    schemaVersion: 1,
    currency: "HUF",
    bufferPolicy: { roundingValueHuf: 1000, roundingThresholdHuf: 500, applyToFixed: false },
    items: [],
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
  };
}

describe("IndexedDbCashFlowRepository", () => {
  let indexedDb: IDBFactory;

  beforeEach(() => {
    indexedDb = new IDBFactory();
  });

  it("round-trips a workspace through IndexedDB", async () => {
    const repository = new IndexedDbCashFlowRepository(indexedDb);
    const original = workspace("owner-a");
    await repository.save(original);
    await expect(repository.load("owner-a", original.workspaceId)).resolves.toEqual(original);
  });

  it("isolates the same workspace id by owner partition", async () => {
    const repository = new IndexedDbCashFlowRepository(indexedDb);
    await repository.save(workspace("owner-a"));
    await expect(repository.load("owner-b", "workspace-1")).resolves.toBeNull();
  });

  it("overwrites the owner-scoped record atomically on save", async () => {
    const repository = new IndexedDbCashFlowRepository(indexedDb);
    const original = workspace("owner-a");
    await repository.save(original);
    const updated = { ...original, updatedAt: "2026-09-28T01:00:00.000Z" };
    await repository.save(updated);
    await expect(repository.load("owner-a", original.workspaceId)).resolves.toEqual(updated);
  });

  it("returns detached values so caller mutation does not mutate persisted state", async () => {
    const repository = new IndexedDbCashFlowRepository(indexedDb);
    const original = workspace("owner-a");
    await repository.save(original);
    const loaded = await repository.load("owner-a", original.workspaceId);
    expect(loaded).not.toBeNull();
    loaded!.bufferPolicy.roundingValueHuf = 9999;
    await expect(repository.load("owner-a", original.workspaceId)).resolves.toEqual(original);
  });
});
