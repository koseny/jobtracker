import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { ActualMovementV2CorrectionScopeError, LinkedActualMovementV2DependencyError, correctActualMovementV2, correctLinkedActualMovementV2, type CorrectActualMovementV2Command } from "./correctActualMovementV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-02T08:00:00Z";
const money = (amountMinor: number) => ({ amountMinor, currencyCode: "HUF" as const });

function workspace(direction: "INCOME" | "EXPENSE" = "EXPENSE", withApply = false): CashFlowWorkspaceV2 {
  const s = emptySourceStateV2();
  s.accounts = ["bank", "cash"].map(accountId => ({ accountId, name: accountId, accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt }));
  s.accountBalanceAnchors = s.accounts.map(account => ({ accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId, anchorType: "INITIAL", balance: money(10_000), effectiveAt: createdAt }));
  s.moneyMovements = [{ movementId: "actual", movementType: direction, lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt }];
  s.moneyMovementRevisions = [{ movementRevisionId: "r1", movementId: "actual", revisionNo: 1, changedAt: createdAt, payload: { movementType: direction, occurredOn: "2026-09-30", amount: money(3000), accountId: "bank", description: "Original" } }];
  s.planItems = [1, 2].map(n => ({ planItemId: `plan-${n}`, monthId: "2026-09", direction, sortOrder: n - 1, name: `Plan ${n}`, currentPlannedAmount: money(3000), planStatus: "ACTIVE", completionStatus: "OPEN", createdAt, updatedAt: createdAt }));
  s.planRealizations = [1200, 800].map((amountMinor, i) => ({ planRealizationId: `real-${i}`, planItemId: `plan-${i + 1}`, movementId: "actual", realizedAmount: money(amountMinor), createdAt }));
  if (withApply) {
    s.allocations = [1, 2].map(n => ({ allocationId: `reserve-${n}`, accountId: "bank", purpose: `Reserve ${n}`, currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt }));
    s.allocationEvents = [500, 700].map((amountMinor, i) => ({ allocationEventId: `apply-${i}`, allocationId: `reserve-${i + 1}`, eventType: "APPLY", amount: money(amountMinor), occurredAt: createdAt, movementId: "actual" }));
  }
  s.dailyEvents = [{ dailyEventId: "event", date: "2026-09-30", title: "Original event", movementIds: ["actual"], createdAt, updatedAt: createdAt }];
  return { workspaceId: "home", ownerPartitionId: "owner", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState: s };
}

function command(direction: "INCOME" | "EXPENSE" = "EXPENSE"): CorrectActualMovementV2Command {
  return { ownerPartitionId: "owner", workspaceId: "home", expectedRevision: 1, changedAt, movementId: "actual", movementRevisionId: "r2", payload: { movementType: direction, occurredOn: "2026-10-01", amount: money(2500), accountId: "bank", description: "Corrected" } };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-linked-correction-test", new IDBFactory()) },
];

describe.each(repositories)("linked actual correction — $name", ({ create }) => {
  it.each(["INCOME", "EXPENSE"] as const)("retains %s plan links and revision history while moving current reporting", async direction => {
    const repository = create(), original = workspace(direction);
    await repository.save("owner", original, null);
    const save = vi.spyOn(repository, "save"), request = command(direction);
    const result = await correctLinkedActualMovementV2(repository, request);
    expect(save).toHaveBeenCalledExactlyOnceWith("owner", result, 1);
    expect(result.sourceState.moneyMovements[0]).toEqual({ ...original.sourceState.moneyMovements[0], currentRevisionNo: 2, updatedAt: changedAt });
    expect(result.sourceState.moneyMovementRevisions).toEqual([...original.sourceState.moneyMovementRevisions, { movementRevisionId: "r2", movementId: "actual", revisionNo: 2, payload: request.payload, changedAt }]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements" && key !== "moneyMovementRevisions") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    const stored = (await repository.load("owner", "home"))!;
    expect(stored).toEqual(result);
    const kpi = direction === "INCOME" ? "income" : "spending";
    expect(project(stored, "2026-09", "EN").overview.kpis.find(x => x.id === kpi)?.value?.amountMinor).toBe(0);
    expect(project(stored, "2026-10", "EN").overview.kpis.find(x => x.id === kpi)?.value?.amountMinor).toBe(2500);
    expect(project(stored, "2026-10", "EN").transactionDetails.actual).toMatchObject({ movementId: "actual", planMatchLabel: "Plan 1, Plan 2", linkedDailyEventLabel: "Original event", auditHistory: [{ revisionNo: 1 }, { revisionNo: 2 }] });
  });

  it("accepts exact aggregate realization and APPLY boundaries without rewriting either link", async () => {
    const repository = create(), original = workspace("EXPENSE", true); await repository.save("owner", original, null);
    const request = command(); request.payload.amount.amountMinor = 2000;
    const result = await correctLinkedActualMovementV2(repository, request);
    expect(result.sourceState.planRealizations).toEqual(original.sourceState.planRealizations);
    expect(result.sourceState.allocationEvents).toEqual(original.sourceState.allocationEvents);
    expect(project(result, "2026-10", "EN").overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(2000);
  });

  it("permits account correction for plan-only links but preserves the DailyEvent date", async () => {
    const repository = create(); await repository.save("owner", workspace(), null);
    const request = command(); request.payload.accountId = "cash";
    const result = await correctLinkedActualMovementV2(repository, request);
    expect(project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(7500);
    expect(result.sourceState.dailyEvents[0]).toMatchObject({ date: "2026-09-30", movementIds: ["actual"] });
  });

  it.each([
    ["realized aggregate exceeds", (s: CashFlowWorkspaceV2, c: CorrectActualMovementV2Command) => { c.payload.amount.amountMinor = 1999; }],
    ["plan direction mismatch", (s: CashFlowWorkspaceV2) => { s.sourceState.planItems[1].direction = "INCOME"; }],
    ["plan currency mismatch", (s: CashFlowWorkspaceV2) => { s.sourceState.planItems[1].currentPlannedAmount.currencyCode = "EUR"; }],
    ["realization currency mismatch", (s: CashFlowWorkspaceV2) => { s.sourceState.planRealizations[1].realizedAmount.currencyCode = "EUR"; }],
    ["unsafe linked amount", (s: CashFlowWorkspaceV2) => { s.sourceState.planRealizations[1].realizedAmount.amountMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ])("blocks %s without saving or mutating dependencies", async (_label, mutate) => {
    const repository = create(), original = workspace(), request = command(); mutate(original, request);
    await repository.save("owner", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctLinkedActualMovementV2(repository, request)).rejects.toBeInstanceOf(LinkedActualMovementV2DependencyError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner", "home")).resolves.toEqual(original);
  });

  it.each([
    ["APPLY aggregate exceeds", (s: CashFlowWorkspaceV2, c: CorrectActualMovementV2Command) => { s.sourceState.planRealizations = []; c.payload.amount.amountMinor = 1199; }],
    ["APPLY on income", (s: CashFlowWorkspaceV2, c: CorrectActualMovementV2Command) => { s.sourceState.planRealizations = []; s.sourceState.moneyMovements[0].movementType = "INCOME"; (s.sourceState.moneyMovementRevisions[0].payload as { movementType: string }).movementType = "INCOME"; c.payload.movementType = "INCOME"; }],
    ["allocation account mismatch", (s: CashFlowWorkspaceV2, c: CorrectActualMovementV2Command) => { c.payload.accountId = "cash"; }],
    ["missing linked account", (s: CashFlowWorkspaceV2, c: CorrectActualMovementV2Command) => { delete c.payload.accountId; }],
    ["APPLY currency mismatch", (s: CashFlowWorkspaceV2) => { s.sourceState.accounts.push({ ...s.sourceState.accounts[0], accountId: "eur", currencyCode: "EUR" }); s.sourceState.allocations[0].accountId = "eur"; s.sourceState.allocations[0].currencyCode = "EUR"; s.sourceState.allocationEvents[0].amount.currencyCode = "EUR"; }],
    ["unsafe APPLY amount", (s: CashFlowWorkspaceV2) => { s.sourceState.allocationEvents[1].amount.amountMinor = Number.MAX_SAFE_INTEGER + 1; }],
  ])("blocks %s without saving", async (_label, mutate) => {
    const repository = create(), original = workspace("EXPENSE", true), request = command(); mutate(original, request);
    await repository.save("owner", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctLinkedActualMovementV2(repository, request)).rejects.toBeInstanceOf(LinkedActualMovementV2DependencyError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner", "home")).resolves.toEqual(original);
  });

  it("rejects movement-linked non-APPLY events as unsupported", async () => {
    const repository = create(), original = workspace("EXPENSE", true);
    original.sourceState.allocationEvents[0].eventType = "RESERVE";
    await repository.save("owner", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctLinkedActualMovementV2(repository, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the standalone command closed for linked movements and linked command closed for unlinked ones", async () => {
    const repository = create(), linked = workspace(); await repository.save("owner", linked, null);
    await expect(correctActualMovementV2(repository, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
    const unlinked = structuredClone(linked); unlinked.sourceState.planRealizations = []; unlinked.sourceState.allocationEvents = [];
    const other = create(); await other.save("owner", unlinked, null);
    await expect(correctLinkedActualMovementV2(other, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
  });

  it("rejects invalid correction, VOIDED target and stale expected revision", async () => {
    const repository = create(); await repository.save("owner", workspace(), null);
    const invalid = command(); invalid.payload.amount.amountMinor = -1;
    await expect(correctLinkedActualMovementV2(repository, invalid)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const current = await correctLinkedActualMovementV2(repository, command());
    await expect(correctLinkedActualMovementV2(repository, command())).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect((await repository.load("owner", "home"))!).toEqual(current);
    const voided = workspace(); voided.sourceState.moneyMovements[0].lifecycleStatus = "VOIDED";
    const another = create(); await another.save("owner", voided, null);
    await expect(correctLinkedActualMovementV2(another, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
  });

  it("does not auto-retry competing linked corrections", async () => {
    const repository = create(); await repository.save("owner", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.movementRevisionId = "other-r2"; other.payload.amount.amountMinor = 2900;
    const results = await Promise.allSettled([correctLinkedActualMovementV2(concurrent, command()), correctLinkedActualMovementV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    const current = (await repository.load("owner", "home"))!;
    expect(current.sourceState.moneyMovementRevisions).toHaveLength(2);
    expect(current.sourceState.planRealizations).toEqual(workspace().sourceState.planRealizations);
  });
});

it("leaves linked history and pointer intact when persistence fails", async () => {
  const original = workspace(), failure = new Error("Storage failed");
  const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
  await expect(correctLinkedActualMovementV2(repository, command())).rejects.toBe(failure);
  expect(repository.save).toHaveBeenCalledTimes(1);
  expect(original).toEqual(workspace());
});
