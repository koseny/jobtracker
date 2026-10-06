import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { type CashFlowRepositoryV2, WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { releaseAllocationV2, reserveAllocationV2, type ReleaseAllocationV2Command, type ReserveAllocationV2Command } from "./allocationReserveV2";

const createdAt = "2026-08-01T00:00:00Z";
const changedAt = "2026-10-03T12:00:00Z";
const money = (amountMinor: number, currencyCode: "HUF" | "EUR" = "HUF") => ({ amountMinor, currencyCode });

function workspace(): CashFlowWorkspaceV2 {
  const s = emptySourceStateV2();
  s.accounts = [
    { accountId: "bank", name: "Bank", accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "euro", name: "Euro", accountType: "SAVINGS", currencyCode: "EUR", active: true, createdAt, updatedAt: createdAt },
  ];
  s.accountBalanceAnchors = s.accounts.map(account => ({ accountBalanceAnchorId: account.accountId + "-anchor", accountId: account.accountId, anchorType: "INITIAL", balance: money(10_000, account.currencyCode), effectiveAt: createdAt }));
  s.planItems = [{ planItemId: "insurance", monthId: "2026-10", direction: "EXPENSE", sortOrder: 0, name: "Insurance", currentPlannedAmount: money(5_000), planStatus: "ACTIVE", completionStatus: "OPEN", createdAt, updatedAt: createdAt }];
  return { workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2, reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt, sourceState: s };
}

function reserve(): ReserveAllocationV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1, changedAt,
    allocationId: "rent", allocationEventId: "rent-r1", amount: money(8_000), occurredAt: "2026-09-30T20:00:00Z",
    newAllocation: { accountId: "bank", purpose: " Rent ", linkedPlanItemId: "insurance" }, note: " First reserve " };
}

function release(expectedRevision = 2): ReleaseAllocationV2Command {
  return { ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision, changedAt: "2026-10-04T12:00:00Z",
    allocationId: "rent", allocationEventId: "rent-release", amount: money(3_000), occurredAt: "2026-10-04T11:00:00Z" };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-allocation-command-test", new IDBFactory()) },
];

describe.each(repositories)("dormant reserve/release — $name", ({ create }) => {
  it("creates a purpose and reserve atomically, then partially releases across a month without a flow", async () => {
    const repository = create(), original = workspace(); await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const reserved = await reserveAllocationV2(repository, reserve());
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", reserved, 1);
    expect(reserved).toMatchObject({ revision: 2, createdAt, updatedAt: changedAt });
    expect(reserved.sourceState.allocations).toEqual([{ allocationId: "rent", accountId: "bank", purpose: "Rent", currencyCode: "HUF", linkedPlanItemId: "insurance", state: "ACTIVE", createdAt: changedAt, updatedAt: changedAt }]);
    expect(reserved.sourceState.allocationEvents).toEqual([{ allocationEventId: "rent-r1", allocationId: "rent", eventType: "RESERVE", amount: money(8_000), occurredAt: "2026-09-30T20:00:00Z", note: "First reserve" }]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "allocations" && key !== "allocationEvents") expect(reserved.sourceState[key]).toEqual(original.sourceState[key]);
    }
    expect(original).toEqual(workspace());
    const september = project(reserved, "2026-09", "EN");
    expect(september.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(10_000), allocated: money(8_000), free: money(2_000) });
    expect(september.overview.kpis.find(x => x.id === "income")?.value).toEqual(money(0));
    expect(september.overview.kpis.find(x => x.id === "spending")?.value).toEqual(money(0));
    expect(september.transactionRows).toEqual([]);
    const released = await releaseAllocationV2(repository, release());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("owner-a", released, 2);
    expect(released.sourceState.allocationEvents[0]).toEqual(reserved.sourceState.allocationEvents[0]);
    expect(released.sourceState.allocationEvents[1]).toEqual({ allocationEventId: "rent-release", allocationId: "rent", eventType: "RELEASE", amount: money(3_000), occurredAt: "2026-10-04T11:00:00Z" });
    expect(released.sourceState.allocations[0]).toEqual({ ...reserved.sourceState.allocations[0], updatedAt: release().changedAt });
    const october = project(released, "2026-10", "EN");
    expect(october.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({ position: money(10_000), allocated: money(5_000), free: money(5_000) });
    expect(october.accounts.allocations[0]).toMatchObject({ reserved: money(5_000), applied: money(0), remaining: money(5_000) });
    expect(project(released, "2026-09", "EN").accounts.allocations[0].remaining).toEqual(money(8_000));
    expect(october.transactionRows).toEqual([]);
    expect(october.overview.kpis.find(x => x.id === "spending")?.value).toEqual(money(0));
    const stored = (await repository.load("owner-a", "home"))!; expect(stored).toEqual(released);
    released.sourceState.allocationEvents[1].amount.amountMinor = 1;
    await expect(repository.load("owner-a", "home")).resolves.toEqual(stored);
  });

  it("supports top-up and full release without changing an undecided closure state", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await reserveAllocationV2(repository, reserve());
    const topup = reserve(); delete topup.newAllocation; topup.expectedRevision = 2; topup.allocationEventId = "rent-r2"; topup.amount = money(2_000); topup.occurredAt = "2026-10-02T00:00:00Z";
    const topped = await reserveAllocationV2(repository, topup);
    expect(project(topped, "2026-10", "EN").accounts.allocations[0].remaining).toEqual(money(10_000));
    const request = release(3); request.amount = money(10_000);
    const result = await releaseAllocationV2(repository, request);
    expect(result.sourceState.allocations[0].state).toBe("ACTIVE");
    expect(project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "bank")?.free).toEqual(money(10_000));
    expect(result.sourceState.moneyMovements).toEqual([]);
  });

  it("uses explicit EUR Money and warns on under-coverage rather than rejecting the reserve", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = reserve(); request.newAllocation = { accountId: "euro", purpose: "Trip" }; request.amount = money(12_000, "EUR");
    const result = await reserveAllocationV2(repository, request);
    const euro = project(result, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "euro");
    expect(euro).toMatchObject({ position: money(10_000, "EUR"), allocated: money(12_000, "EUR"), free: money(-2_000, "EUR") });
    expect(project(result, "2026-10", "EN").accounts.allocations[0].overAllocated).toBe(true);
    const r = release(); r.amount = money(2_000, "EUR");
    const released = await releaseAllocationV2(repository, r);
    expect(project(released, "2026-10", "EN").accounts.accounts.find(x => x.accountId === "euro")?.position).toEqual(money(10_000, "EUR"));
  });

  it("counts only active APPLY for release capacity, retaining voided APPLY history", async () => {
    const repository = create(), original = workspace();
    original.sourceState.allocations = [{ allocationId: "rent", accountId: "bank", purpose: "Rent", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt }];
    original.sourceState.moneyMovements = ["active", "voided"].map(movementId => ({ movementId, movementType: "EXPENSE", lifecycleStatus: movementId === "active" ? "ACTIVE" : "VOIDED", currentRevisionNo: 1, createdAt, updatedAt: createdAt }));
    original.sourceState.moneyMovementRevisions = ["active", "voided"].map(movementId => ({ movementRevisionId: movementId + "-r1", movementId, revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-01", amount: money(1_000), accountId: "bank", description: movementId } }));
    original.sourceState.allocationEvents = [
      { allocationEventId: "r1", allocationId: "rent", eventType: "RESERVE", amount: money(5_000), occurredAt: "2026-09-01T00:00:00Z" },
      { allocationEventId: "a1", allocationId: "rent", eventType: "APPLY", amount: money(1_000), occurredAt: "2026-10-01T00:00:00Z", movementId: "active" },
      { allocationEventId: "a2", allocationId: "rent", eventType: "APPLY", amount: money(1_000), occurredAt: "2026-10-01T00:00:00Z", movementId: "voided" },
    ];
    await repository.save("owner-a", original, null);
    const request = release(1); request.amount = money(4_000);
    const result = await releaseAllocationV2(repository, request);
    expect(result.sourceState.allocationEvents.slice(0, 3)).toEqual(original.sourceState.allocationEvents);
    expect(project(result, "2026-10", "EN").accounts.allocations[0].remaining).toEqual(money(0));
    expect(result.sourceState.moneyMovements).toEqual(original.sourceState.moneyMovements);
  });

  it.each([
    ["missing account", (c: ReserveAllocationV2Command) => { c.newAllocation!.accountId = "missing"; }],
    ["inactive account", (c: ReserveAllocationV2Command, w: CashFlowWorkspaceV2) => { w.sourceState.accounts[0].active = false; }],
    ["missing plan", (c: ReserveAllocationV2Command) => { c.newAllocation!.linkedPlanItemId = "missing"; }],
    ["blank purpose", (c: ReserveAllocationV2Command) => { c.newAllocation!.purpose = " "; }],
    ["wrong native currency", (c: ReserveAllocationV2Command) => { c.amount.currencyCode = "EUR"; }],
    ["unsupported currency", (c: ReserveAllocationV2Command) => { (c.amount as {currencyCode: string}).currencyCode = "USD"; }],
    ["negative amount", (c: ReserveAllocationV2Command) => { c.amount.amountMinor = -1; }],
    ["zero amount", (c: ReserveAllocationV2Command) => { c.amount.amountMinor = 0; }],
    ["unsafe amount", (c: ReserveAllocationV2Command) => { c.amount.amountMinor = Number.MAX_SAFE_INTEGER + 1; }],
    ["invalid effective time", (c: ReserveAllocationV2Command) => { c.occurredAt = "2026-02-30T00:00:00Z"; }],
    ["blank note", (c: ReserveAllocationV2Command) => { c.note = " "; }],
  ] as const)("rejects %s before any reserve write", async (_label, change) => {
    const repository = create(), original = workspace(), request = reserve(); change(request, original);
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    await expect(reserveAllocationV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled(); await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects a duplicate allocation or event without a partial pair", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await reserveAllocationV2(repository, reserve());
    const repeated = reserve(); repeated.expectedRevision = 2; repeated.allocationEventId = "different";
    await expect(reserveAllocationV2(repository, repeated)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const topup = reserve(); delete topup.newAllocation; topup.expectedRevision = 2;
    await expect(reserveAllocationV2(repository, topup)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect((await repository.load("owner-a", "home"))?.revision).toBe(2);
  });

  it("rejects over-release, unavailable backdated amount and later consumption without a write", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const initial = await reserveAllocationV2(repository, reserve());
    const save = vi.spyOn(repository, "save");
    const tooMuch = release(); tooMuch.amount = money(8_001);
    await expect(releaseAllocationV2(repository, tooMuch)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const beforeReserve = release(); beforeReserve.occurredAt = "2026-09-01T00:00:00Z";
    await expect(releaseAllocationV2(repository, beforeReserve)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const future = release(); future.occurredAt = "2026-10-01T00:00:00Z"; future.amount = money(7_000);
    // A future RELEASE makes a backdated RELEASE invalid even if today's total looked sufficient.
    const first = await releaseAllocationV2(repository, future);
    const backdated = release(3); backdated.allocationEventId = "backdated"; backdated.occurredAt = "2026-09-30T23:00:00Z"; backdated.amount = money(2_000);
    await expect(releaseAllocationV2(repository, backdated)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).toHaveBeenCalledTimes(1);
    expect(first.sourceState.allocationEvents).toHaveLength(2);
    expect(initial.sourceState.allocationEvents).toHaveLength(1);
  });

  it("rejects a top-up whose aggregate would lose integer precision", async () => {
    const repository = create(), original = workspace();
    original.sourceState.allocations = [{ allocationId: "rent", accountId: "bank", purpose: "Rent", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt }];
    original.sourceState.allocationEvents = [{ allocationEventId: "old", allocationId: "rent", eventType: "RESERVE", amount: money(Number.MAX_SAFE_INTEGER), occurredAt: createdAt }];
    await repository.save("owner-a", original, null);
    const request = reserve(); delete request.newAllocation; request.allocationEventId = "new"; request.amount = money(1);
    const save = vi.spyOn(repository, "save");
    await expect(reserveAllocationV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects wrong currency, missing allocation and non-ACTIVE allocation", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await reserveAllocationV2(repository, reserve());
    const wrong = release(); wrong.amount.currencyCode = "EUR";
    await expect(releaseAllocationV2(repository, wrong)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const missing = release(); missing.allocationId = "other";
    await expect(releaseAllocationV2(repository, missing)).rejects.toBeInstanceOf(DomainV2ValidationError);
    const other = workspace(); other.sourceState.allocations = [{ ...((await repository.load("owner-a", "home"))!).sourceState.allocations[0], state: "RELEASED" }];
    const second = create(); await second.save("owner-a", other, null);
    const notActive = release(1);
    await expect(releaseAllocationV2(second, notActive)).rejects.toBeInstanceOf(DomainV2ValidationError);
  });

  it("isolates owners and rejects stale revisions", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = reserve(); request.ownerPartitionId = "owner-b";
    await expect(reserveAllocationV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const other = workspace(); other.ownerPartitionId = "owner-b"; await repository.save("owner-b", other, null);
    await reserveAllocationV2(repository, request);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    await expect(reserveAllocationV2(repository, request)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
  });

  it("commits one concurrent release and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null); await reserveAllocationV2(repository, reserve());
    let unlock!: () => void, loads = 0; const gate = new Promise<void>(resolve => { unlock = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => { const value = await repository.load(owner, id); if (++loads === 2) unlock(); await gate; return value; },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = release(); other.allocationEventId = "other";
    const results = await Promise.allSettled([releaseAllocationV2(concurrent, release()), releaseAllocationV2(concurrent, other)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    expect((await repository.load("owner-a", "home"))?.sourceState.allocationEvents).toHaveLength(2);
  });
});

describe("allocation command input and persistence boundaries", () => {
  it("does not mutate a loaded source on failed save", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository = { load: vi.fn(async () => original), save: vi.fn(async () => { throw failure; }) };
    await expect(reserveAllocationV2(repository, reserve())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1); expect(original).toEqual(workspace());
  });
  it("snapshots nested identity, amount and effective time before asynchronous load", async () => {
    const repository = new InMemoryCashFlowRepositoryV2(); await repository.save("owner-a", workspace(), null);
    const request = reserve(), original = structuredClone(request);
    const pending = reserveAllocationV2(repository, request);
    request.ownerPartitionId = "wrong"; request.newAllocation!.accountId = "wrong";
    request.amount.amountMinor = 1; request.occurredAt = "2026-10-01T00:00:00Z";
    const result = await pending;
    expect(result.sourceState.allocations[0].accountId).toBe(original.newAllocation!.accountId);
    expect(result.sourceState.allocationEvents[0]).toMatchObject({ amount: original.amount, occurredAt: original.occurredAt });
  });
});
