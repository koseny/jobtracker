import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { adjustAllocationV2, type AdjustAllocationV2Command } from "./adjustAllocationV2";

const createdAt = "2026-09-01T00:00:00Z";
const changedAt = "2026-10-05T09:00:00Z";
const money = (amountMinor: number, currencyCode: "HUF" | "EUR" = "HUF") => ({ amountMinor, currencyCode });

function workspace(): CashFlowWorkspaceV2 {
  const s = emptySourceStateV2();
  s.accounts = [
    { accountId: "bank", name: "Bank", accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "eur", name: "Euro", accountType: "SAVINGS", currencyCode: "EUR", active: true, createdAt, updatedAt: createdAt },
  ];
  s.accountBalanceAnchors = s.accounts.map(account => ({ accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId, anchorType: "INITIAL", balance: money(10_000, account.currencyCode), effectiveAt: createdAt }));
  s.allocations = [
    { allocationId: "rent", accountId: "bank", purpose: "Rent", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt },
    { allocationId: "trip", accountId: "eur", purpose: "Trip", currencyCode: "EUR", state: "ACTIVE", createdAt, updatedAt: createdAt },
  ];
  s.allocationEvents = [
    { allocationEventId: "reserve-rent", allocationId: "rent", eventType: "RESERVE", amount: money(8_000), occurredAt: "2026-09-30T00:00:00Z" },
    { allocationEventId: "reserve-trip", allocationId: "trip", eventType: "RESERVE", amount: money(5_000, "EUR"), occurredAt: "2026-09-30T00:00:00Z" },
    { allocationEventId: "apply-rent", allocationId: "rent", eventType: "APPLY", amount: money(1_000), occurredAt: "2026-10-01T00:00:00Z", movementId: "expense" },
  ];
  s.moneyMovements = [{ movementId: "expense", movementType: "EXPENSE", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt }];
  s.moneyMovementRevisions = [{ movementRevisionId: "expense-r1", movementId: "expense", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-01", amount: money(1_000), accountId: "bank", description: "Rent paid" } }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState: s };
}

function command(): AdjustAllocationV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt,
    allocationId: "rent", allocationEventId: "adjust-rent", amount: money(2_000),
    occurredAt: "2026-10-05T08:00:00Z", reason: "  Correct reserve  " };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-adjust-test", new IDBFactory()) },
];

describe.each(repositories)("dormant allocation ADJUST — $name", ({ create }) => {
  it("appends a positive signed correction without changing actuals, position or BE/KI", async () => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const result = await adjustAllocationV2(repository, command());
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(result.sourceState.allocations[0]).toEqual({ ...original.sourceState.allocations[0], updatedAt: changedAt });
    expect(result.sourceState.allocations[1]).toEqual(original.sourceState.allocations[1]);
    expect(result.sourceState.allocationEvents.slice(0, 3)).toEqual(original.sourceState.allocationEvents);
    expect(result.sourceState.allocationEvents[3]).toEqual({ allocationEventId: "adjust-rent", allocationId: "rent", eventType: "ADJUST", amount: money(2_000), occurredAt: "2026-10-05T08:00:00Z", note: "Correct reserve" });
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "allocations" && key !== "allocationEvents") expect(result.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace());
    const before = project(original, "2026-10", "EN"), after = project(result, "2026-10", "EN");
    expect(before.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(9_000), allocated: money(7_000), free: money(2_000) });
    expect(after.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(9_000), allocated: money(9_000), free: money(0) });
    expect(after.accounts.allocations.find(x => x.allocationId === "rent")).toMatchObject({ reserved: money(10_000), applied: money(1_000), remaining: money(9_000) });
    expect(after.overview.kpis.find(x => x.id === "spending")?.value).toEqual(before.overview.kpis.find(x => x.id === "spending")?.value);
    expect(after.transactionRows).toEqual(before.transactionRows);
    expect(project(result, "2026-09", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(8_000));
    expect(project(result, "2026-11", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(9_000));
    const stored = (await repository.load("owner-a", "home"))!; expect(stored).toEqual(result);
    result.sourceState.allocationEvents[3].amount.amountMinor = 1;
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("supports a negative correction and full zero reserve without automatic closure", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const negative = command(); negative.amount = money(-2_000);
    const first = await adjustAllocationV2(repository, negative);
    expect(project(first, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "bank")?.free).toEqual(money(4_000));
    const second = command(); second.expectedRevision = 2; second.allocationEventId = "adjust-rest"; second.amount = money(-5_000); second.occurredAt = "2026-10-06T08:00:00Z";
    const zero = await adjustAllocationV2(repository, second);
    expect(project(zero, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(0));
    expect(zero.sourceState.allocations[0].state).toBe("ACTIVE");
    expect(zero.sourceState.moneyMovements).toEqual(workspace().sourceState.moneyMovements);
  });

  it("uses account-native EUR Money without conversion or new FX facts", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.allocationId = "trip"; request.amount = money(-1_000, "EUR");
    const result = await adjustAllocationV2(repository, request);
    expect(project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "eur")).toMatchObject({ position: money(10_000, "EUR"), allocated: money(4_000, "EUR"), free: money(6_000, "EUR") });
    expect(result.sourceState.fxRateQuotes).toEqual([]);
  });

  it("surfaces over-allocation after a positive correction instead of changing account position", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.amount = money(5_000);
    const result = await adjustAllocationV2(repository, request);
    const view = project(result, "2026-10", "EN");
    expect(view.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(9_000), allocated: money(12_000), free: money(-3_000) });
    expect(view.accounts.allocations.find(x => x.allocationId === "rent")?.overAllocated).toBe(true);
  });

  it("retains historical VOIDED APPLY but excludes it from negative ADJUST coverage", async () => {
    const repository = create(), original = workspace(); original.sourceState.moneyMovements[0].lifecycleStatus = "VOIDED"; original.sourceState.moneyMovements[0].voidedAt = changedAt;
    await repository.save("owner-a", original, null);
    const request = command(); request.amount = money(-8_000);
    const result = await adjustAllocationV2(repository, request);
    expect(result.sourceState.allocationEvents[2]).toEqual(original.sourceState.allocationEvents[2]);
    expect(project(result, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(0));
    expect(result.sourceState.moneyMovements).toEqual(original.sourceState.moneyMovements);
  });

  it("rejects a negative adjustment before RESERVE or beyond the effective-day remainder", async () => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const before = command(); before.amount = money(-1); before.occurredAt = "2026-09-01T08:00:00Z";
    await expect(adjustAllocationV2(repository, before)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const excess = command(); excess.amount = money(-7_001);
    await expect(adjustAllocationV2(repository, excess)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled(); await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects a backdated adjustment that makes a later RELEASE undercovered", async () => {
    const repository = create(), original = workspace();
    original.sourceState.allocationEvents.push({ allocationEventId: "release", allocationId: "rent", eventType: "RELEASE", amount: money(6_000), occurredAt: "2026-10-06T00:00:00Z" });
    await repository.save("owner-a", original, null);
    const request = command(); request.amount = money(-1_001);
    const save = vi.spyOn(repository, "save");
    await expect(adjustAllocationV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled(); await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects unsafe aggregate precision even when the individual adjustment is safe", async () => {
    const repository = create(), original = workspace(); original.sourceState.allocationEvents[0].amount.amountMinor = Number.MAX_SAFE_INTEGER;
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(adjustAllocationV2(repository, command())).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ["zero amount", (c: AdjustAllocationV2Command) => { c.amount.amountMinor = 0; }],
    ["fractional amount", (c: AdjustAllocationV2Command) => { c.amount.amountMinor = 0.5; }],
    ["unsafe amount", (c: AdjustAllocationV2Command) => { c.amount.amountMinor = Number.MAX_SAFE_INTEGER + 1; }],
    ["wrong currency", (c: AdjustAllocationV2Command) => { c.amount.currencyCode = "EUR"; }],
    ["unsupported currency", (c: AdjustAllocationV2Command) => { (c.amount as {currencyCode: string}).currencyCode = "USD"; }],
    ["blank reason", (c: AdjustAllocationV2Command) => { c.reason = "  "; }],
    ["blank allocation id", (c: AdjustAllocationV2Command) => { c.allocationId = " "; }],
    ["blank event id", (c: AdjustAllocationV2Command) => { c.allocationEventId = " "; }],
    ["invalid effective time", (c: AdjustAllocationV2Command) => { c.occurredAt = "2026-02-30T08:00:00Z"; }],
    ["missing allocation", (c: AdjustAllocationV2Command) => { c.allocationId = "missing"; }],
    ["duplicate event", (c: AdjustAllocationV2Command) => { c.allocationEventId = "reserve-rent"; }],
  ])("rejects %s without changing state", async (_label, change) => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save"), request = command(); change(request);
    await expect(adjustAllocationV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled(); await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects a non-ACTIVE allocation", async () => {
    const repository = create(), original = workspace(); original.sourceState.allocations[0].state = "RELEASED";
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(adjustAllocationV2(repository, command())).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
  });

  it("isolates owner partitions and refuses a stale revision", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = command(); request.ownerPartitionId = "owner-b";
    await expect(adjustAllocationV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b"; await repository.save("owner-b", other, null);
    await adjustAllocationV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    await expect(adjustAllocationV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
  });

  it("commits only one of two concurrent adjustments without automatic retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let unlock!: () => void, loads = 0; const gate = new Promise<void>(resolve => { unlock = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) unlock(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = command(); other.allocationEventId = "other"; other.amount = money(-1_000);
    const results = await Promise.allSettled([adjustAllocationV2(concurrent, command()), adjustAllocationV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    expect((await repository.load("owner-a", "home"))?.sourceState.allocationEvents).toHaveLength(4);
  });
});

describe("ADJUST input and persistence boundaries", () => {
  it("does not mutate a loaded source when save fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(adjustAllocationV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1); expect(original).toEqual(workspace());
  });
  it("snapshots nested amount, identity, reason and effective time before asynchronous load", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = command(), original = structuredClone(request);
    const pending = adjustAllocationV2(repository, request);
    request.ownerPartitionId = "wrong"; request.allocationId = "wrong"; request.amount.amountMinor = -1;
    request.reason = "wrong"; request.occurredAt = "2026-10-06T00:00:00Z";
    const result = await pending;
    expect(result.sourceState.allocationEvents.at(-1)).toMatchObject({ allocationId: original.allocationId, amount: original.amount, occurredAt: original.occurredAt, note: original.reason.trim() });
  });
});
