import { describe, expect, it } from "vitest";
import type { CashFlowItem, CashFlowWorkspace } from "../domain/cashFlow";
import { InMemoryCashFlowRepository } from "../adapters/persistence/inMemoryCashFlowRepository";
import { addItem, deleteItem, saveWorkspace, WorkspaceNotFoundError } from "./cashFlowService";
import { DomainValidationError } from "../domain/validation";

const baseWorkspace = (ownerPartitionId = "owner-a"): CashFlowWorkspace => ({
  workspaceId: "home",
  ownerPartitionId,
  schemaVersion: 1,
  currency: "HUF",
  bufferPolicy: { roundingValueHuf: 1_000, roundingThresholdHuf: 500, applyToFixed: false },
  items: [],
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
});

const item: CashFlowItem = {
  id: "salary",
  name: "Salary",
  direction: "income",
  mode: "bank",
  planningStatus: "scheduled",
  expenseType: null,
  schedule: { frequency: "monthly" },
  expectedAmountHuf: 500_000,
  createdAt: "2026-09-27T01:00:00Z",
  updatedAt: "2026-09-27T01:00:00Z",
};

describe("cashFlowService", () => {
  it("adds a valid item inside the active owner partition", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save(baseWorkspace());
    const updated = await addItem(repository, "owner-a", "home", item);
    expect(updated.items).toEqual([item]);
    expect((await repository.load("owner-a", "home"))?.items).toEqual([item]);
  });

  it("rejects invalid items before persistence", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save(baseWorkspace());
    await expect(addItem(repository, "owner-a", "home", { ...item, name: " " })).rejects.toBeInstanceOf(DomainValidationError);
    expect((await repository.load("owner-a", "home"))?.items).toEqual([]);
  });

  it("rejects duplicate item ids", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save({ ...baseWorkspace(), items: [item] });
    await expect(addItem(repository, "owner-a", "home", item)).rejects.toThrow("already exists");
  });

  it("cannot reach another owner's workspace", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save(baseWorkspace("owner-a"));
    await expect(addItem(repository, "owner-b", "home", item)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });

  it("hard-deletes an item from persisted source state", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save({ ...baseWorkspace(), items: [item] });
    const updated = await deleteItem(repository, "owner-a", "home", item.id, "2026-09-27T02:00:00Z");
    expect(updated.items).toEqual([]);
    expect((await repository.load("owner-a", "home"))?.items).toEqual([]);
  });

  it("validates a whole workspace before save", async () => {
    const repository = new InMemoryCashFlowRepository();
    await expect(saveWorkspace(repository, "owner-a", {
      ...baseWorkspace(),
      bufferPolicy: { roundingValueHuf: 0, roundingThresholdHuf: 500, applyToFixed: false },
    })).rejects.toBeInstanceOf(DomainValidationError);
    expect(await repository.load("owner-a", "home")).toBeNull();
  });
});
