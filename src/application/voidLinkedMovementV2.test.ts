import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { voidLinkedMovementV2, voidMovementV2, VoidMovementV2ScopeError, type VoidMovementV2Command } from "./voidMovementV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-03T10:00:00Z";
const money = (amountMinor: number) => ({ amountMinor, currencyCode: "HUF" as const });

function workspace(withApply = true): CashFlowWorkspaceV2 {
  const s = emptySourceStateV2();
  s.accounts = ["bank", "cash"].map(accountId => ({ accountId, name: accountId, accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt }));
  s.accountBalanceAnchors = s.accounts.map(account => ({ accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId, anchorType: "INITIAL", balance: money(10_000), effectiveAt: createdAt }));
  s.moneyMovements = ["actual", "other"].map(movementId => ({ movementId, movementType: "EXPENSE" as const, lifecycleStatus: "ACTIVE" as const, currentRevisionNo: 1, createdAt, updatedAt: createdAt }));
  s.moneyMovementRevisions = ["actual", "other"].map(movementId => ({ movementRevisionId: movementId + "-r1", movementId, revisionNo: 1, changedAt: createdAt,
    payload: { movementType: "EXPENSE" as const, occurredOn: "2026-09-30", amount: money(movementId === "actual" ? 2000 : 500), accountId: "bank", description: movementId },
  }));
  s.planItems = [{ planItemId: "plan", monthId: "2026-09", direction: "EXPENSE", sortOrder: 0, name: "Plan", currentPlannedAmount: money(2000), planStatus: "ACTIVE", completionStatus: "OPEN", createdAt, updatedAt: createdAt }];
  s.planRealizations = [{ planRealizationId: "real", planItemId: "plan", movementId: "actual", realizedAmount: money(1200), createdAt }];
  if (withApply) {
    s.allocations = [{ allocationId: "reserve", accountId: "bank", purpose: "Reserve", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt }];
    s.allocationEvents = [
      { allocationEventId: "reserve-event", allocationId: "reserve", eventType: "RESERVE", amount: money(3000), occurredAt: "2026-09-01T00:00:00Z" },
      { allocationEventId: "apply-actual", allocationId: "reserve", eventType: "APPLY", amount: money(700), occurredAt: "2026-09-30T00:00:00Z", movementId: "actual" },
      { allocationEventId: "apply-other", allocationId: "reserve", eventType: "APPLY", amount: money(300), occurredAt: "2026-09-30T00:00:00Z", movementId: "other" },
    ];
  }
  s.dailyEvents = [{ dailyEventId: "event", date: "2026-09-30", title: "Day", movementIds: ["actual"], createdAt, updatedAt: createdAt }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState: s };
}

function command(): VoidMovementV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt, movementId: "actual", reason: "  Cancelled  " };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-linked-void-test", new IDBFactory()) },
];

describe.each(repositories)("linked movement VOID — $name", ({ create }) => {
  it("retains plan/APPLY/DailyEvent history, excludes linked active effects and leaves another APPLY active", async () => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const before = project(original, "2026-09", "EN"), save = vi.spyOn(repository, "save");
    expect(before.month.spendingGroups.flatMap(x => x.rows).find(x => x.id === "plan")?.actual).toEqual(money(1200));
    expect(before.accounts.allocations[0]).toMatchObject({ applied: money(1000), remaining: money(2000) });
    expect(before.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(7500), allocated: money(2000), free: money(5500) });

    const result = await voidLinkedMovementV2(repository, command());
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.moneyMovements[0]).toEqual({ ...original.sourceState.moneyMovements[0], lifecycleStatus: "VOIDED", updatedAt: changedAt, voidedAt: changedAt, voidReason: "Cancelled" });
    expect(result.sourceState.moneyMovements[1]).toEqual(original.sourceState.moneyMovements[1]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace());
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual(result);
    const model = project(stored, "2026-09", "EN");
    expect(model.month.spendingGroups.flatMap(x => x.rows).find(x => x.id === "plan")?.actual).toBeUndefined();
    expect(model.accounts.allocations[0]).toMatchObject({ reserved: money(3000), applied: money(300), remaining: money(2700) });
    expect(model.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(9500), allocated: money(2700), free: money(6800) });
    expect(model.overview.kpis.find(x => x.id === "spending")?.value).toEqual(money(500));
    expect(model.transactionRows.find(x => x.movementId === "actual")).toMatchObject({ lifecycleStatus: "VOIDED" });
    expect(model.transactionDetails.actual).toMatchObject({ planMatchLabel: "Plan", linkedDailyEventLabel: "Day", auditHistory: [{ revisionNo: 1 }] });
    const entries = model.calendar.days.find(x => x.date === "2026-09-30")?.entries || [];
    expect(entries).toContainEqual(expect.objectContaining({ id: "event", kind: "EVENT" }));
    expect(entries.map(x => x.id)).not.toContain("actual");
    result.sourceState.allocationEvents[1].amount.amountMinor = 999;
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("supports plan-only INCOME and retains corrected revisions with an optional reason", async () => {
    const repository = create(), original = workspace(false);
    original.sourceState.moneyMovements[0].movementType = "INCOME";
    original.sourceState.planItems[0].direction = "INCOME";
    original.sourceState.moneyMovementRevisions[0].payload.movementType = "INCOME";
    original.sourceState.moneyMovements[0].currentRevisionNo = 2;
    original.sourceState.moneyMovementRevisions.push({ movementRevisionId: "actual-r2", movementId: "actual", revisionNo: 2, changedAt: "2026-10-01T12:00:00Z", payload: { movementType: "INCOME", occurredOn: "2026-10-01", amount: money(2500), accountId: "cash", description: "Corrected" } });
    await repository.save("owner-a", original, null);
    const request = command(); delete request.reason;
    const result = await voidLinkedMovementV2(repository, request);
    expect(result.sourceState.moneyMovements[0]).toEqual({ ...original.sourceState.moneyMovements[0], lifecycleStatus: "VOIDED", updatedAt: changedAt, voidedAt: changedAt });
    expect(result.sourceState.moneyMovementRevisions).toEqual(original.sourceState.moneyMovementRevisions);
    const model = project(result, "2026-10", "EN");
    expect(model.overview.kpis.find(x => x.id === "income")?.value).toEqual(money(0));
    expect(project(result, "2026-09", "EN").month.incomeGroups.flatMap(x => x.rows).find(x => x.id === "plan")?.actual).toBeUndefined();
    expect(model.transactionRows.find(x => x.movementId === "actual")).toMatchObject({ amount: money(2500), lifecycleStatus: "VOIDED" });
  });

  it("keeps the standalone command closed for linked and the linked command closed for unlinked", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await expect(voidMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    const unlinked = workspace(false); unlinked.sourceState.planRealizations = [];
    const other = create(); await other.save("owner-a", unlinked, null);
    await expect(voidLinkedMovementV2(other, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
  });

  it.each(["RESERVE", "RELEASE", "ADJUST"] as const)("rejects movement-linked %s events without saving", async eventType => {
    const repository = create(), original = workspace();
    original.sourceState.allocationEvents[1].eventType = eventType;
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(voidLinkedMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects incompatible APPLY account and does not rewrite dependencies", async () => {
    const repository = create(), original = workspace();
    original.sourceState.allocations[0].accountId = "cash";
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(voidLinkedMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects an APPLY linked to INCOME even when the source validator permits the legacy link", async () => {
    const repository = create(), original = workspace();
    original.sourceState.moneyMovements[0].movementType = "INCOME";
    original.sourceState.moneyMovementRevisions[0].payload.movementType = "INCOME";
    original.sourceState.planItems[0].direction = "INCOME";
    await repository.save("owner-a", original, null);
    await expect(voidLinkedMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects a TRANSFER with a legacy movement-linked APPLY", async () => {
    const repository = create(), original = workspace();
    original.sourceState.moneyMovements[0].movementType = "TRANSFER";
    original.sourceState.moneyMovementRevisions[0].payload = { movementType: "TRANSFER", occurredOn: "2026-09-30", sourceAccountId: "bank", destinationAccountId: "cash", sourceAmount: money(2000), destinationAmount: money(2000), description: "Transfer" };
    original.sourceState.planRealizations = [];
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(voidLinkedMovementV2(repository, command())).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a second VOID without overwriting audit fields", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const first = await voidLinkedMovementV2(repository, command()), request = command();
    request.expectedRevision = 2; request.reason = "Another";
    const save = vi.spyOn(repository, "save");
    await expect(voidLinkedMovementV2(repository, request)).rejects.toBeInstanceOf(VoidMovementV2ScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(first);
  });

  it.each([
    ["missing movement", { movementId: "missing" }],
    ["blank reason", { reason: "  " }],
    ["invalid audit time", { changedAt: "2026-02-30T10:00:00Z" }],
  ])("rejects %s before saving", async (_label, changes) => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command(); Object.assign(request, changes);
    await expect(voidLinkedMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("isolates the owner partition and rejects a stale revision", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(voidLinkedMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b"; await repository.save("owner-b", other, null);
    await voidLinkedMovementV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    await expect(voidLinkedMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
  });

  it("commits one concurrent linked VOID and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.reason = "Other";
    const results = await Promise.allSettled([voidLinkedMovementV2(concurrent, command()), voidLinkedMovementV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    expect((await repository.load("owner-a", "home"))!.sourceState.planRealizations).toEqual(workspace().sourceState.planRealizations);
  });
});

describe("linked VOID persistence and input boundary", () => {
  it("does not mutate loaded source when save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(voidLinkedMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });
  it("snapshots identity, reason and audit time before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = voidLinkedMovementV2(repository, request);
    request.ownerPartitionId = "wrong"; request.movementId = "wrong"; request.reason = "wrong"; request.changedAt = "2026-10-04T00:00:00Z";
    const result = await pending;
    expect(result.sourceState.moneyMovements[0]).toMatchObject({ movementId: original.movementId, voidReason: original.reason?.trim(), voidedAt: original.changedAt });
  });
});
