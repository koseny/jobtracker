import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { createTransferMovementV2, type CreateTransferMovementV2Command } from "./createTransferMovementV2";

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
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState };
}

function command(): CreateTransferMovementV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt,
    movementId: "transfer", movementRevisionId: "transfer-r1",
    payload: { movementType: "TRANSFER", occurredOn: "2026-10-01", sourceAccountId: "bank", destinationAccountId: "cash", sourceAmount: { amountMinor: 5000, currencyCode: "HUF" }, destinationAmount: { amountMinor: 5000, currencyCode: "HUF" }, description: "Internal" },
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-transfer-command-test", new IDBFactory()) },
];

describe.each(repositories)("transfer creation — $name", ({ create }) => {
  it("atomically creates a same-currency transfer pair with neutral BE/KI and opposite account effects", async () => {
    const repository = create(), original = workspace(), request = command();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const result = await createTransferMovementV2(repository, request);
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.moneyMovements).toEqual([{ movementId: "transfer", movementType: "TRANSFER", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt: changedAt, updatedAt: changedAt }]);
    expect(result.sourceState.moneyMovementRevisions).toEqual([{ movementRevisionId: "transfer-r1", movementId: "transfer", revisionNo: 1, payload: request.payload, changedAt }]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements" && key !== "moneyMovementRevisions") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace());
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored).toEqual(result);
    const model = project(stored, "2026-10", "EN");
    expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(0);
    expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(0);
    expect(model.accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(95_000);
    expect(model.accounts.accounts.find(x => x.accountId === "cash")?.position.amountMinor).toBe(15_000);
    expect(model.transactionRows).toContainEqual(expect.objectContaining({ movementId: "transfer", movementType: "TRANSFER", accountLabel: "Bank HUF", counterAccountLabel: "Cash HUF" }));
    expect(model.calendar.days.find(x => x.date === "2026-10-01")?.entries).toContainEqual(expect.objectContaining({ id: "transfer", kind: "TRANSFER" }));
    result.sourceState.moneyMovementRevisions[0].payload.description = "Caller edit";
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("uses both supplied native amounts for a cross-currency transfer without creating FX income, quote, fee or reserve", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command();
    request.payload.sourceAccountId = "euro";
    request.payload.destinationAccountId = "bank";
    request.payload.sourceAmount = { amountMinor: 100, currencyCode: "EUR" };
    request.payload.destinationAmount = { amountMinor: 39_000, currencyCode: "HUF" };
    const result = await createTransferMovementV2(repository, request);
    const model = project(result, "2026-10", "EN");
    expect(model.accounts.accounts.find(x => x.accountId === "euro")?.position).toEqual({ amountMinor: 99_900, currencyCode: "EUR" });
    expect(model.accounts.accounts.find(x => x.accountId === "bank")?.position).toEqual({ amountMinor: 139_000, currencyCode: "HUF" });
    expect(model.transactionRows[0]).toMatchObject({ amount: request.payload.sourceAmount, counterAmount: request.payload.destinationAmount });
    expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(0);
    expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(0);
    expect(result.sourceState.fxRateQuotes).toEqual([]);
    expect(result.sourceState.allocationEvents).toEqual([]);
    expect(result.sourceState.allocations).toEqual([]);
    expect(result.sourceState.planRealizations).toEqual([]);
  });

  it("permits explicit zero amounts under the existing validator and keeps reporting neutral", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.payload.sourceAmount.amountMinor = 0; request.payload.destinationAmount.amountMinor = 0;
    const result = await createTransferMovementV2(repository, request);
    expect(result.sourceState.moneyMovementRevisions[0].payload).toEqual(request.payload);
    expect(project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "bank")?.position.amountMinor).toBe(100_000);
  });

  it.each([
    ["wrong type", { movementType: "INCOME" }],
    ["same account", { destinationAccountId: "bank" }],
    ["missing source", { sourceAccountId: "absent" }],
    ["missing destination", { destinationAccountId: "absent" }],
    ["blank source", { sourceAccountId: " " }],
    ["blank destination", { destinationAccountId: " " }],
    ["source currency mismatch", { sourceAmount: { amountMinor: 5000, currencyCode: "EUR" } }],
    ["destination currency mismatch", { destinationAmount: { amountMinor: 5000, currencyCode: "EUR" } }],
    ["unsupported currency", { sourceAmount: { amountMinor: 5000, currencyCode: "USD" } }],
    ["unequal same-currency amounts", { destinationAmount: { amountMinor: 4900, currencyCode: "HUF" } }],
    ["negative source", { sourceAmount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["negative destination", { destinationAmount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["unsafe source", { sourceAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["unsafe destination", { destinationAmount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["invalid date", { occurredOn: "2026-02-30" }],
  ])("rejects %s with no save", async (_label, payloadChanges) => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command();
    Object.assign(request.payload, payloadChanges);
    await expect(createTransferMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it.each(["movementId", "movementRevisionId"] as const)("rejects duplicate %s with no partial pair", async field => {
    const repository = create(), original = workspace(), request = command();
    original.sourceState.moneyMovements.push({ movementId: "existing", movementType: "TRANSFER", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt });
    original.sourceState.moneyMovementRevisions.push({ movementRevisionId: "existing-r1", movementId: "existing", revisionNo: 1, payload: { ...request.payload }, changedAt: createdAt });
    await repository.save("owner-a", original, null);
    if (field === "movementId") request.movementId = "existing";
    else request.movementRevisionId = "existing-r1";
    const save = vi.spyOn(repository, "save");
    await expect(createTransferMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects missing owner workspace and isolates another owner's same-id transfer", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(createTransferMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b";
    await repository.save("owner-b", other, null);
    await createTransferMovementV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    expect((await repository.load("owner-b", "home"))?.sourceState.moneyMovements[0].movementId).toBe("transfer");
  });

  it("rejects a stale expected revision without changing either part of the transfer", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const current = await createTransferMovementV2(repository, command());
    const request = command(); request.movementId = "later"; request.movementRevisionId = "later-r1";
    const save = vi.spyOn(repository, "save");
    await expect(createTransferMovementV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(current);
  });

  it("commits one concurrent transfer and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let release!: () => void, loads = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) release(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.movementId = "other"; other.movementRevisionId = "other-r1";
    const results = await Promise.allSettled([createTransferMovementV2(concurrent, command()), createTransferMovementV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    const stored = (await repository.load("owner-a", "home"))!;
    expect(stored.sourceState.moneyMovements).toHaveLength(1);
    expect(stored.sourceState.moneyMovementRevisions).toHaveLength(1);
    expect(stored.sourceState.moneyMovements[0].movementId).toBe(stored.sourceState.moneyMovementRevisions[0].movementId);
  });

  it("preserves the same-day anchor refusal for an affected account", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.payload.occurredOn = "2026-08-01";
    const result = await createTransferMovementV2(repository, request);
    expect(() => project(result, "2026-10", "EN")).toThrow("same calendar date");
  });
});

describe("transfer command failure/input boundary", () => {
  it("leaves both accounts and source state untouched when save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(createTransferMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });
  it("snapshots native amounts, account IDs and audit input before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = createTransferMovementV2(repository, request);
    request.ownerPartitionId = "wrong"; request.movementId = "wrong"; request.payload.sourceAccountId = "wrong";
    request.payload.sourceAmount.amountMinor = 999;
    const result = await pending;
    expect(result.sourceState.moneyMovementRevisions[0]).toMatchObject({ movementId: original.movementId, payload: original.payload, changedAt: original.changedAt });
  });
});
