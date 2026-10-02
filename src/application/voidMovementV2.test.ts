import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2, MovementType } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { voidMovementV2, VoidMovementV2ScopeError, type VoidMovementV2Command } from "./voidMovementV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-02T20:00:00Z";

function workspace(type: MovementType = "EXPENSE"): CashFlowWorkspaceV2 {
  const sourceState = emptySourceStateV2();
  sourceState.accounts = ["bank", "cash"].map(accountId => ({
    accountId, name: accountId, accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt,
  }));
  sourceState.accountBalanceAnchors = sourceState.accounts.map(account => ({
    accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId,
    anchorType: "INITIAL", balance: { amountMinor: 10_000, currencyCode: "HUF" }, effectiveAt: createdAt,
  }));
  sourceState.moneyMovements = [{ movementId: "actual", movementType: type, lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt }];
  sourceState.moneyMovementRevisions = [{ movementRevisionId: "actual-r1", movementId: "actual", revisionNo: 1, changedAt: createdAt,
    payload: type === "TRANSFER"
      ? { movementType: "TRANSFER", occurredOn: "2026-09-30", sourceAccountId: "bank", destinationAccountId: "cash", sourceAmount: { amountMinor: 1000, currencyCode: "HUF" }, destinationAmount: { amountMinor: 1000, currencyCode: "HUF" }, description: "Original" }
      : { movementType: type, occurredOn: "2026-09-30", amount: { amountMinor: 1000, currencyCode: "HUF" }, accountId: "bank", description: "Original" },
  }];
  sourceState.dailyEvents = [{ dailyEventId: "event", date: "2026-09-30", title: "Day", movementIds: ["actual"], createdAt, updatedAt: createdAt }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState };
}

function command(): VoidMovementV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt, movementId: "actual", reason: "  Duplicate entry  " };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-void-command-test", new IDBFactory()) },
];

describe.each(repositories)("unlinked movement VOID — $name", ({ create }) => {
  it.each(["INCOME", "EXPENSE", "TRANSFER"] as const)("voids %s atomically, retains ledger/audit/DailyEvent and removes active financial effects", async type => {
    const repository = create(), original = workspace(type);
    await repository.save("owner-a", original, null);
    const before = project(original, "2026-09", "EN"), save = vi.spyOn(repository, "save");
    expect(before.accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(type === "INCOME" ? 11_000 : 9_000);
    const result = await voidMovementV2(repository, command());
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.moneyMovements).toEqual([{ ...original.sourceState.moneyMovements[0], lifecycleStatus: "VOIDED", updatedAt: changedAt, voidedAt: changedAt, voidReason: "Duplicate entry" }]);
    expect(result.sourceState.moneyMovementRevisions).toEqual(original.sourceState.moneyMovementRevisions);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace(type));
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual(result);
    const model = project(stored, "2026-09", "EN");
    expect(model.accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(10_000);
    expect(model.accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(10_000);
    expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(0);
    expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(0);
    expect(model.transactionRows).toContainEqual(expect.objectContaining({ movementId: "actual", movementType: type, lifecycleStatus: "VOIDED" }));
    const entries = model.calendar.days.find(x => x.date === "2026-09-30")?.entries || [];
    expect(entries).toContainEqual(expect.objectContaining({ id: "event", kind: "EVENT" }));
    expect(entries.map(x => x.id)).not.toContain("actual");
    result.sourceState.moneyMovements[0].voidReason = "Caller edit";
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("allows an omitted reason and preserves all earlier correction revisions", async () => {
    const repository = create(), original = workspace();
    original.sourceState.moneyMovements[0].currentRevisionNo = 2;
    original.sourceState.moneyMovementRevisions.push({ movementRevisionId: "actual-r2", movementId: "actual", revisionNo: 2, changedAt: "2026-10-01T12:00:00Z", payload: { movementType: "EXPENSE", occurredOn: "2026-10-01", amount: { amountMinor: 2500, currencyCode: "HUF" }, accountId: "cash", description: "Corrected" } });
    await repository.save("owner-a", original, null);
    const request = command(); delete request.reason;
    const result = await voidMovementV2(repository, request);
    expect(result.sourceState.moneyMovements[0]).toEqual({ ...original.sourceState.moneyMovements[0], lifecycleStatus: "VOIDED", updatedAt: changedAt, voidedAt: changedAt });
    expect(result.sourceState.moneyMovementRevisions).toEqual(original.sourceState.moneyMovementRevisions);
    expect(project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(10_000);
    expect(project(result, "2026-10", "EN").transactionRows[0]).toMatchObject({ amount: { amountMinor: 2500, currencyCode: "HUF" }, lifecycleStatus: "VOIDED" });
  });

  it.each(["plan", "allocation"])("refuses %s-linked void without changing dependencies", async link => {
    const repository = create(), original = workspace();
    if (link === "plan") {
      original.sourceState.planItems.push({ planItemId: "plan", monthId: "2026-09", direction: "EXPENSE", name: "Plan", currentPlannedAmount: { amountMinor: 1000, currencyCode: "HUF" }, planStatus: "ACTIVE", completionStatus: "OPEN", createdAt, updatedAt: createdAt });
      original.sourceState.planRealizations.push({ planRealizationId: "link", planItemId: "plan", movementId: "actual", realizedAmount: { amountMinor: 1000, currencyCode: "HUF" }, createdAt });
    } else {
      original.sourceState.allocations.push({ allocationId: "reserve", accountId: "bank", purpose: "Reserve", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt });
      original.sourceState.allocationEvents.push({ allocationEventId: "apply", allocationId: "reserve", eventType: "APPLY", amount: { amountMinor: 1000, currencyCode: "HUF" }, occurredAt: createdAt, movementId: "actual" });
    }
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(voidMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("refuses a second VOID and does not overwrite the original audit metadata", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const first = await voidMovementV2(repository, command()), request = command();
    request.expectedRevision = 2; request.reason = "Another reason";
    const save = vi.spyOn(repository, "save");
    await expect(voidMovementV2(repository, request)).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(first);
  });

  it.each([
    ["missing movement", { movementId: "missing" }],
    ["blank movement id", { movementId: " " }],
    ["blank reason", { reason: "  " }],
    ["invalid audit time", { changedAt: "2026-02-30T20:00:00Z" }],
  ])("rejects %s before saving", async (_label, changes) => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command(); Object.assign(request, changes);
    await expect(voidMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("isolates the owner partition and rejects a stale expected revision", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(voidMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b";
    await repository.save("owner-b", other, null);
    await voidMovementV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    await expect(voidMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect((await repository.load("owner-b", "home"))?.revision).toBe(2);
  });

  it("commits one concurrent VOID and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.reason = "Other reason";
    const results = await Promise.allSettled([voidMovementV2(concurrent, command()), voidMovementV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored.sourceState.moneyMovements[0].lifecycleStatus).toBe("VOIDED");
    expect(stored.sourceState.moneyMovementRevisions).toHaveLength(1);
  });

  it("a VOID removes the same-day anchor ambiguity for this movement without changing the precision rule", async () => {
    const repository = create(), original = workspace();
    original.sourceState.moneyMovementRevisions[0].payload.occurredOn = "2026-08-01";
    await repository.save("owner-a", original, null);
    expect(() => project(original, "2026-09", "EN")).toThrow("same calendar date");
    const result = await voidMovementV2(repository, command());
    expect(project(result, "2026-09", "EN").accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(10_000);
  });
});

describe("VOID failure and input boundary", () => {
  it("does not mutate loaded source when the save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(voidMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });
  it("snapshots identity, reason and timestamp before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = voidMovementV2(repository, request);
    request.ownerPartitionId = "wrong"; request.movementId = "wrong"; request.reason = "wrong"; request.changedAt = "2026-10-03T00:00:00Z";
    const result = await pending;
    expect(result.sourceState.moneyMovements[0]).toMatchObject({ movementId: original.movementId, voidReason: original.reason?.trim(), voidedAt: original.changedAt });
  });
});
