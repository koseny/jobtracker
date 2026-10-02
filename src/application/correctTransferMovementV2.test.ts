import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { correctTransferMovementV2, TransferMovementV2CorrectionScopeError, type CorrectTransferMovementV2Command } from "./correctTransferMovementV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-02T09:00:00Z";

function workspace(): CashFlowWorkspaceV2 {
  const sourceState = emptySourceStateV2();
  sourceState.accounts = [
    { accountId: "bank", name: "Bank HUF", accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "cash", name: "Cash HUF", accountType: "CASH", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "euro", name: "Bank EUR", accountType: "BANK", currencyCode: "EUR", active: true, createdAt, updatedAt: createdAt },
  ];
  sourceState.accountBalanceAnchors = sourceState.accounts.map(account => ({
    accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId,
    anchorType: "INITIAL", balance: { amountMinor: account.accountId === "cash" ? 10_000 : 100_000, currencyCode: account.currencyCode }, effectiveAt: createdAt,
  }));
  sourceState.moneyMovements = [{ movementId: "transfer", movementType: "TRANSFER", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt }];
  sourceState.moneyMovementRevisions = [{ movementRevisionId: "transfer-r1", movementId: "transfer", revisionNo: 1, changedAt: createdAt,
    payload: { movementType: "TRANSFER", occurredOn: "2026-09-30", sourceAccountId: "bank", destinationAccountId: "cash", sourceAmount: { amountMinor: 5000, currencyCode: "HUF" }, destinationAmount: { amountMinor: 5000, currencyCode: "HUF" }, description: "Original" },
  }];
  sourceState.dailyEvents = [{ dailyEventId: "event", date: "2026-09-30", title: "Day", movementIds: ["transfer"], createdAt, updatedAt: createdAt }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState };
}

function command(): CorrectTransferMovementV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt,
    movementId: "transfer", movementRevisionId: "transfer-r2",
    payload: { movementType: "TRANSFER", occurredOn: "2026-10-01", sourceAccountId: "cash", destinationAccountId: "bank", sourceAmount: { amountMinor: 2500, currencyCode: "HUF" }, destinationAmount: { amountMinor: 2500, currencyCode: "HUF" }, description: "Corrected" },
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-transfer-correction-test", new IDBFactory()) },
];

describe.each(repositories)("transfer correction — $name", ({ create }) => {
  it("atomically appends the new current revision; history, stable identity and DailyEvent survive a date/account change", async () => {
    const repository = create(), original = workspace(), request = command();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const result = await correctTransferMovementV2(repository, request);
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.moneyMovements).toEqual([{ ...original.sourceState.moneyMovements[0], currentRevisionNo: 2, updatedAt: changedAt }]);
    expect(result.sourceState.moneyMovementRevisions).toEqual([original.sourceState.moneyMovementRevisions[0], { movementRevisionId: "transfer-r2", movementId: "transfer", revisionNo: 2, payload: request.payload, changedAt }]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements" && key !== "moneyMovementRevisions") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace());
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual(result);
    const september = project(stored, "2026-09", "EN"), october = project(stored, "2026-10", "EN");
    expect(september.transactionRows).toHaveLength(1);
    expect(september.transactionRows[0].occurredOn).toBe("2026-10-01");
    expect(september.calendar.days.find(x => x.date === "2026-09-30")?.entries.map(x => x.kind)).toEqual(["EVENT"]);
    expect(october.transactionRows).toContainEqual(expect.objectContaining({ movementId: "transfer", movementType: "TRANSFER", accountLabel: "Cash HUF", counterAccountLabel: "Bank HUF", amount: request.payload.sourceAmount, counterAmount: request.payload.destinationAmount }));
    expect(october.calendar.days.find(x => x.date === "2026-10-01")?.entries).toContainEqual(expect.objectContaining({ id: "transfer", kind: "TRANSFER" }));
    expect(october.accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(102_500);
    expect(october.accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(7_500);
    for (const model of [september, october]) {
      expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(0);
      expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(0);
    }
    result.sourceState.moneyMovementRevisions[0].payload.description = "Caller edit";
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("uses explicit cross-currency native amounts and revised accounts without FX, fees or BE/KI", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command();
    request.payload.sourceAccountId = "euro";
    request.payload.sourceAmount = { amountMinor: 100, currencyCode: "EUR" };
    request.payload.destinationAmount = { amountMinor: 39_000, currencyCode: "HUF" };
    const result = await correctTransferMovementV2(repository, request), model = project(result, "2026-10", "EN");
    expect(model.accounts.accounts.find(x => x.accountId === "bank")?.position).toEqual({ amountMinor: 139_000, currencyCode: "HUF" });
    expect(model.accounts.accounts.find(x => x.accountId === "cash")?.position).toEqual({ amountMinor: 10_000, currencyCode: "HUF" });
    expect(model.accounts.accounts.find(x => x.accountId === "euro")?.position).toEqual({ amountMinor: 99_900, currencyCode: "EUR" });
    expect(model.transactionRows[0]).toMatchObject({ amount: request.payload.sourceAmount, counterAmount: request.payload.destinationAmount });
    expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(0);
    expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(0);
    expect(result.sourceState.fxRateQuotes).toEqual([]);
    expect(result.sourceState.allocationEvents).toEqual([]);
  });

  it("can append a third revision while leaving both prior revisions untouched", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const second = await correctTransferMovementV2(repository, command()), request = command();
    request.expectedRevision = 2; request.movementRevisionId = "transfer-r3";
    request.payload.sourceAmount.amountMinor = 0; request.payload.destinationAmount.amountMinor = 0;
    const third = await correctTransferMovementV2(repository, request);
    expect(third.sourceState.moneyMovements[0].currentRevisionNo).toBe(3);
    expect(third.sourceState.moneyMovementRevisions.slice(0, 2)).toEqual(second.sourceState.moneyMovementRevisions);
    expect(project(third, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(100_000);
  });

  it.each(["VOIDED", "INCOME"] as const)("rejects %s movement with no save", async kind => {
    const repository = create(), original = workspace();
    if (kind === "VOIDED") original.sourceState.moneyMovements[0].lifecycleStatus = kind;
    else {
      original.sourceState.moneyMovements[0].movementType = kind;
      original.sourceState.moneyMovementRevisions[0].payload = { movementType: "INCOME", occurredOn: "2026-09-30", amount: { amountMinor: 5000, currencyCode: "HUF" }, accountId: "bank", description: "Income" };
    }
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctTransferMovementV2(repository, command())).rejects.toBeInstanceOf(TransferMovementV2CorrectionScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("refuses a movement-linked allocation without silently changing its dependency", async () => {
    const repository = create(), original = workspace();
    original.sourceState.allocations.push({ allocationId: "reserve", accountId: "bank", purpose: "Reserve", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt });
    original.sourceState.allocationEvents.push({ allocationEventId: "apply", allocationId: "reserve", eventType: "APPLY", amount: { amountMinor: 1000, currencyCode: "HUF" }, occurredAt: createdAt, movementId: "transfer" });
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(correctTransferMovementV2(repository, command())).rejects.toBeInstanceOf(TransferMovementV2CorrectionScopeError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it.each([
    ["duplicate revision ID", { movementRevisionId: "transfer-r1" }, {}],
    ["blank revision ID", { movementRevisionId: " " }, {}],
    ["missing movement", { movementId: "missing" }, {}],
    ["wrong payload type", {}, { movementType: "EXPENSE" }],
    ["same account", {}, { destinationAccountId: "cash" }],
    ["missing source account", {}, { sourceAccountId: "missing" }],
    ["missing destination account", {}, { destinationAccountId: "missing" }],
    ["source currency mismatch", {}, { sourceAmount: { amountMinor: 2500, currencyCode: "EUR" } }],
    ["destination currency mismatch", {}, { destinationAmount: { amountMinor: 2500, currencyCode: "EUR" } }],
    ["unequal same-currency", {}, { destinationAmount: { amountMinor: 2400, currencyCode: "HUF" } }],
    ["negative source", {}, { sourceAmount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["negative destination", {}, { destinationAmount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["unsafe source", {}, { sourceAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["unsafe destination", {}, { destinationAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["invalid date", {}, { occurredOn: "2026-02-30" }],
  ])("rejects %s before saving", async (_label, changes, payloadChanges) => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command();
    Object.assign(request, changes); Object.assign(request.payload, payloadChanges);
    await expect(correctTransferMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("isolates the owner partition and rejects a stale expected revision", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(correctTransferMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b";
    await repository.save("owner-b", other, null);
    await correctTransferMovementV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    const stale = command(); stale.ownerPartitionId = "owner-b";
    await expect(correctTransferMovementV2(repository, stale)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect((await repository.load("owner-b", "home"))?.revision).toBe(2);
  });

  it("commits one concurrent correction and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.movementRevisionId = "alternate-r2";
    const results = await Promise.allSettled([correctTransferMovementV2(concurrent, command()), correctTransferMovementV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored.sourceState.moneyMovementRevisions).toHaveLength(2);
    expect(stored.sourceState.moneyMovements[0].currentRevisionNo).toBe(2);
  });

  it("retains the same-day anchor refusal if the correction lands on the anchor date", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.payload.occurredOn = "2026-08-01";
    const result = await correctTransferMovementV2(repository, request);
    expect(() => project(result, "2026-10", "EN")).toThrow("same calendar date");
  });
});

describe("transfer correction failure and input boundary", () => {
  it("does not mutate loaded source when the save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(correctTransferMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });
  it("snapshots accounts, native amounts and audit input before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = correctTransferMovementV2(repository, request);
    request.ownerPartitionId = "wrong"; request.movementId = "wrong"; request.payload.sourceAccountId = "wrong";
    request.payload.sourceAmount.amountMinor = 999;
    const result = await pending;
    expect(result.sourceState.moneyMovementRevisions[1]).toMatchObject({ movementId: original.movementId, payload: original.payload, changedAt: original.changedAt });
  });
});
