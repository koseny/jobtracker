import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { ActualMovementV2CorrectionScopeError, correctActualMovementV2, type CorrectActualMovementV2Command } from "./correctActualMovementV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-01T18:00:00Z";

function workspace(type: "INCOME" | "EXPENSE" = "EXPENSE"): CashFlowWorkspaceV2 {
  const sourceState = emptySourceStateV2();
  sourceState.accounts = ["bank", "cash"].map(accountId => ({
    accountId, name: accountId, accountType: "BANK", currencyCode: "HUF", active: true,
    createdAt, updatedAt: createdAt,
  }));
  sourceState.accountBalanceAnchors = sourceState.accounts.map(account => ({
    accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId,
    anchorType: "INITIAL", balance: { amountMinor: 10_000, currencyCode: "HUF" }, effectiveAt: createdAt,
  }));
  sourceState.moneyMovements = [{
    movementId: "actual", movementType: type, lifecycleStatus: "ACTIVE", currentRevisionNo: 1,
    createdAt, updatedAt: createdAt,
  }];
  sourceState.moneyMovementRevisions = [{
    movementRevisionId: "actual-r1", movementId: "actual", revisionNo: 1, changedAt: createdAt,
    payload: { movementType: type, occurredOn: "2026-09-30", amount: { amountMinor: 2_000, currencyCode: "HUF" }, accountId: "bank", description: "Original" },
  }];
  sourceState.categories = [{ categoryId: "category", name: "User label", active: true, sortOrder: 1 }];
  sourceState.dailyEvents = [{
    dailyEventId: "event", date: "2026-09-30", title: "Original event", movementIds: ["actual"],
    createdAt, updatedAt: createdAt,
  }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState };
}

function command(type: "INCOME" | "EXPENSE" = "EXPENSE"): CorrectActualMovementV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt,
    movementId: "actual", movementRevisionId: "actual-r2",
    payload: { movementType: type, occurredOn: "2026-10-01", amount: { amountMinor: 2_500, currencyCode: "HUF" }, accountId: "cash", categoryId: "category", description: "Corrected" },
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-correction-test", new IDBFactory()) },
];

describe.each(repositories)("standalone correction — $name", ({ create }) => {
  it.each(["INCOME", "EXPENSE"] as const)("corrects %s atomically, retains history and moves month/account effects", async type => {
    const repository = create(), original = workspace(type);
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command(type);
    const result = await correctActualMovementV2(repository, request);
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.moneyMovements).toEqual([{ ...original.sourceState.moneyMovements[0], currentRevisionNo: 2, updatedAt: changedAt }]);
    expect(result.sourceState.moneyMovementRevisions).toEqual([
      original.sourceState.moneyMovementRevisions[0],
      { movementRevisionId: "actual-r2", movementId: "actual", revisionNo: 2, payload: request.payload, changedAt },
    ]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements" && key !== "moneyMovementRevisions") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace(type));
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual(result);
    const september = project(stored, "2026-09", "EN"), october = project(stored, "2026-10", "EN");
    const kpi = type === "INCOME" ? "income" : "spending";
    expect(september.overview.kpis.find(x => x.id === kpi)?.value?.amountMinor).toBe(0);
    expect(october.overview.kpis.find(x => x.id === kpi)?.value?.amountMinor).toBe(2_500);
    expect(october.accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(10_000);
    expect(october.accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(type === "INCOME" ? 12_500 : 7_500);
    expect(october.transactionRows).toHaveLength(1);
    expect(october.transactionRows[0]).toMatchObject({ movementId: "actual", description: "Corrected", amount: request.payload.amount });
    expect(september.calendar.days.find(x => x.date === "2026-09-30")?.entries.map(x => x.kind)).toEqual(["EVENT"]);
    expect(october.calendar.days.find(x => x.date === "2026-10-01")?.entries).toContainEqual(expect.objectContaining({ id: "actual", kind: `ACTUAL_${type}` }));
    result.sourceState.moneyMovementRevisions[0].payload.description = "Caller edit";
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("appends revision 3 without rewriting either earlier revision", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const second = await correctActualMovementV2(repository, command());
    const request = command();
    request.expectedRevision = 2;
    request.movementRevisionId = "actual-r3";
    request.payload.amount.amountMinor = 0;
    delete request.payload.accountId;
    delete request.payload.categoryId;
    const third = await correctActualMovementV2(repository, request);
    expect(third.revision).toBe(3);
    expect(third.sourceState.moneyMovements[0].currentRevisionNo).toBe(3);
    expect(third.sourceState.moneyMovementRevisions.slice(0, 2)).toEqual(second.sourceState.moneyMovementRevisions);
    expect(third.sourceState.moneyMovementRevisions[2].payload).toEqual(request.payload);
  });

  it("preserves explicit native currency and leaves missing FX incomplete", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    request.payload.amount = { amountMinor: 1234, currencyCode: "EUR" };
    delete request.payload.accountId;
    const result = await correctActualMovementV2(repository, request);
    const model = project(result, "2026-10", "EN");
    expect(model.transactionRows[0].amount).toEqual(request.payload.amount);
    expect(model.overview.kpis.find(x => x.id === "spending")).toMatchObject({ value: null, incomplete: true });
    expect(result.sourceState.moneyMovementRevisions[0].payload).toEqual(workspace().sourceState.moneyMovementRevisions[0].payload);
    expect(result.sourceState.fxRateQuotes).toEqual([]);
  });

  it.each(["plan", "allocation"])("refuses %s-linked corrections without changing dependencies", async link => {
    const repository = create(), original = workspace();
    if (link === "plan") {
      original.sourceState.planItems.push({ planItemId: "plan", monthId: "2026-09", direction: "EXPENSE", sortOrder: 0, name: "Plan", currentPlannedAmount: { amountMinor: 2000, currencyCode: "HUF" }, planStatus: "ACTIVE", completionStatus: "OPEN", createdAt, updatedAt: createdAt });
      original.sourceState.planRealizations.push({ planRealizationId: "link", planItemId: "plan", movementId: "actual", realizedAmount: { amountMinor: 2000, currencyCode: "HUF" }, createdAt });
    } else {
      original.sourceState.allocations.push({ allocationId: "reserve", accountId: "bank", purpose: "Reserve", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt });
      original.sourceState.allocationEvents.push({ allocationEventId: "apply", allocationId: "reserve", eventType: "APPLY", amount: { amountMinor: 2000, currencyCode: "HUF" }, occurredAt: createdAt, movementId: "actual" });
    }
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctActualMovementV2(repository, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it.each(["VOIDED", "TRANSFER"] as const)("refuses %s movement correction", async kind => {
    const repository = create(), original = workspace();
    if (kind === "VOIDED") original.sourceState.moneyMovements[0].lifecycleStatus = kind;
    else {
      original.sourceState.moneyMovements[0].movementType = kind;
      original.sourceState.moneyMovementRevisions[0].payload = { movementType: "TRANSFER", occurredOn: "2026-09-30", sourceAccountId: "bank", destinationAccountId: "cash", sourceAmount: { amountMinor: 2000, currencyCode: "HUF" }, destinationAmount: { amountMinor: 2000, currencyCode: "HUF" }, description: "Transfer" };
    }
    await repository.save("owner-a", original, null);
    await expect(correctActualMovementV2(repository, command())).rejects.toBeInstanceOf(ActualMovementV2CorrectionScopeError);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it.each([
    ["duplicate revision id", { movementRevisionId: "actual-r1" }, {}],
    ["blank revision id", { movementRevisionId: " " }, {}],
    ["missing movement", { movementId: "missing" }, {}],
    ["changed direction", {}, { movementType: "INCOME" }],
    ["unsupported transfer payload", {}, { movementType: "TRANSFER" }],
    ["negative amount", {}, { amount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["unsafe amount", {}, { amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["currency mismatch", {}, { amount: { amountMinor: 1, currencyCode: "EUR" } }],
    ["bad date", {}, { occurredOn: "2026-02-30" }],
    ["unknown account", {}, { accountId: "missing" }],
    ["blank account", {}, { accountId: " " }],
    ["unknown category", {}, { categoryId: "missing" }],
  ])("rejects %s before saving", async (_label, changes, payloadChanges) => {
    const repository = create(), original = workspace();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command();
    Object.assign(request, changes);
    Object.assign(request.payload, payloadChanges);
    await expect(correctActualMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("isolates another owner's same-id movement", async () => {
    const repository = create(), other = workspace();
    other.ownerPartitionId = "owner-b";
    await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(correctActualMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    await repository.save("owner-b", other, null);
    await correctActualMovementV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    expect((await repository.load("owner-b", "home"))?.revision).toBe(2);
  });

  it("rejects a stale correction and leaves the current revision intact", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const current = await correctActualMovementV2(repository, command());
    const request = command(); request.movementRevisionId = "stale";
    const save = vi.spyOn(repository, "save");
    await expect(correctActualMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(current);
  });

  it("commits one concurrent correction without losing history or retrying", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.movementRevisionId = "competing-r2"; other.payload.amount.amountMinor = 3000;
    const results = await Promise.allSettled([correctActualMovementV2(concurrent, command()), correctActualMovementV2(concurrent, other)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual((results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<CashFlowWorkspaceV2>).value);
    expect(stored.sourceState.moneyMovementRevisions).toHaveLength(2);
    expect(stored.sourceState.moneyMovementRevisions[0]).toEqual(workspace().sourceState.moneyMovementRevisions[0]);
    expect(stored.sourceState.moneyMovements[0].currentRevisionNo).toBe(2);
  });

  it("preserves the unresolved same-day anchor refusal after correction", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.payload.occurredOn = "2026-08-01";
    const result = await correctActualMovementV2(repository, request);
    expect(() => project(result, "2026-10", "EN")).toThrow("same calendar date");
  });
});

describe("correction failure/input boundary", () => {
  it("does not advance the pointer or change history when save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(correctActualMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });
  it("snapshots the supplied correction before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = correctActualMovementV2(repository, request);
    request.ownerPartitionId = "other"; request.movementId = "other"; request.movementRevisionId = "other";
    request.payload.amount.amountMinor = 999;
    const result = await pending;
    expect(result.sourceState.moneyMovementRevisions[1]).toMatchObject({ movementId: original.movementId, movementRevisionId: original.movementRevisionId, payload: original.payload });
  });
});
