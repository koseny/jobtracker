import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import {
  type CashFlowRepositoryV2,
  WorkspaceV2NotFoundError,
  WorkspaceV2RevisionConflictError,
} from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels as project } from "../features/readModel/projectWorkspaceV2";
import { applyAllocationV2, type ApplyAllocationV2Command } from "./allocationApplyV2";
import { voidLinkedMovementV2 } from "./voidMovementV2";

const createdAt = "2026-09-01T00:00:00Z";
const changedAt = "2026-10-03T18:00:00Z";
const money = (amountMinor: number, currencyCode: "HUF" | "EUR" = "HUF") => ({
  amountMinor,
  currencyCode,
});

function workspace(): CashFlowWorkspaceV2 {
  const s = emptySourceStateV2();
  s.accounts = [
    { accountId: "bank", name: "Bank", accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "bank2", name: "Bank 2", accountType: "BANK", currencyCode: "HUF", active: true, createdAt, updatedAt: createdAt },
    { accountId: "euro", name: "Euro", accountType: "SAVINGS", currencyCode: "EUR", active: true, createdAt, updatedAt: createdAt },
  ];
  s.accountBalanceAnchors = [
    { accountBalanceAnchorId: "bank-a", accountId: "bank", anchorType: "INITIAL", balance: money(20_000), effectiveAt: "2026-09-01T00:00:00Z" },
    { accountBalanceAnchorId: "bank2-a", accountId: "bank2", anchorType: "INITIAL", balance: money(20_000), effectiveAt: "2026-09-01T00:00:00Z" },
    { accountBalanceAnchorId: "euro-a", accountId: "euro", anchorType: "INITIAL", balance: money(10_000, "EUR"), effectiveAt: "2026-09-01T00:00:00Z" },
  ];
  s.allocations = [
    { allocationId: "rent", accountId: "bank", purpose: "Rent", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt },
    { allocationId: "other", accountId: "bank", purpose: "Other", currencyCode: "HUF", state: "ACTIVE", createdAt, updatedAt: createdAt },
    { allocationId: "euro-trip", accountId: "euro", purpose: "Trip", currencyCode: "EUR", state: "ACTIVE", createdAt, updatedAt: createdAt },
  ];
  s.allocationEvents = [
    { allocationEventId: "rent-r", allocationId: "rent", eventType: "RESERVE", amount: money(10_000), occurredAt: "2026-09-10T00:00:00Z" },
    { allocationEventId: "other-r", allocationId: "other", eventType: "RESERVE", amount: money(5_000), occurredAt: "2026-09-10T00:00:00Z" },
    { allocationEventId: "euro-r", allocationId: "euro-trip", eventType: "RESERVE", amount: money(5_000, "EUR"), occurredAt: "2026-09-10T00:00:00Z" },
  ];
  s.moneyMovements = [
    { movementId: "expense", movementType: "EXPENSE", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "expense2", movementType: "EXPENSE", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "expense-bank2", movementType: "EXPENSE", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "eur-expense", movementType: "EXPENSE", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "income", movementType: "INCOME", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "transfer", movementType: "TRANSFER", lifecycleStatus: "ACTIVE", currentRevisionNo: 1, createdAt, updatedAt: createdAt },
    { movementId: "voided-expense", movementType: "EXPENSE", lifecycleStatus: "VOIDED", currentRevisionNo: 1, createdAt, updatedAt: createdAt, voidedAt: changedAt },
  ];
  s.moneyMovementRevisions = [
    { movementRevisionId: "expense-r1", movementId: "expense", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(6_000), accountId: "bank", description: "Rent paid" } },
    { movementRevisionId: "expense2-r1", movementId: "expense2", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-04", amount: money(8_000), accountId: "bank", description: "Other expense" } },
    { movementRevisionId: "expense-bank2-r1", movementId: "expense-bank2", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-04", amount: money(8_000), accountId: "bank2", description: "Bank 2 expense" } },
    { movementRevisionId: "eur-expense-r1", movementId: "eur-expense", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-03", amount: money(3_000, "EUR"), accountId: "euro", description: "EUR expense" } },
    { movementRevisionId: "income-r1", movementId: "income", revisionNo: 1, changedAt: createdAt, payload: { movementType: "INCOME", occurredOn: "2026-10-02", amount: money(6_000), accountId: "bank", description: "Income" } },
    { movementRevisionId: "transfer-r1", movementId: "transfer", revisionNo: 1, changedAt: createdAt, payload: { movementType: "TRANSFER", occurredOn: "2026-10-02", sourceAccountId: "bank", destinationAccountId: "euro", sourceAmount: money(4_000), destinationAmount: money(1_000, "EUR"), description: "Transfer" } },
    { movementRevisionId: "voided-r1", movementId: "voided-expense", revisionNo: 1, changedAt: createdAt, payload: { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(2_000), accountId: "bank", description: "Voided" } },
  ];
  return {
    workspaceId: "home",
    ownerPartitionId: "owner-a",
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    sourceState: s,
  };
}

function apply(expectedRevision = 1): ApplyAllocationV2Command {
  return {
    ownerPartitionId: "owner-a",
    workspaceId: "home",
    expectedRevision,
    changedAt,
    allocationId: "rent",
    allocationEventId: "rent-a1",
    movementId: "expense",
    amount: money(3_000),
    occurredAt: "2026-10-03T12:00:00Z",
    note: " Use reserve ",
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal("hcf-v2-allocation-apply-test", new IDBFactory()) },
];

describe.each(repositories)("dormant allocation APPLY — $name", ({ create }) => {
  it("consumes reserve against an existing expense without creating duplicate KI", async () => {
    const repository = create(), original = workspace();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");

    const result = await applyAllocationV2(repository, apply());

    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result.revision).toBe(2);
    expect(result.sourceState.moneyMovements).toEqual(original.sourceState.moneyMovements);
    expect(result.sourceState.moneyMovementRevisions).toEqual(original.sourceState.moneyMovementRevisions);
    expect(result.sourceState.planRealizations).toEqual([]);
    expect(result.sourceState.allocationEvents.at(-1)).toEqual({
      allocationEventId: "rent-a1",
      allocationId: "rent",
      eventType: "APPLY",
      amount: money(3_000),
      occurredAt: "2026-10-03T12:00:00Z",
      movementId: "expense",
      note: "Use reserve",
    });
    expect(result.sourceState.allocations.find(x => x.allocationId === "rent")?.updatedAt).toBe(changedAt);

    const view = project(result, "2026-10", "EN");
    expect(view.overview.kpis.find(x => x.id === "spending")?.value).toEqual(money(22_000));
    expect(view.transactionRows.filter(x => x.movementType === "EXPENSE" && x.lifecycleStatus === "ACTIVE")).toHaveLength(4);
    expect(view.accounts.allocations.find(x => x.allocationId === "rent")).toMatchObject({
      reserved: money(10_000),
      applied: money(3_000),
      remaining: money(7_000),
    });
    expect(view.accounts.accounts.find(x => x.accountId === "bank")).toMatchObject({
      position: money(6_000),
      allocated: money(12_000),
      free: money(-6_000),
    });
  });

  it("allows multiple partial APPLY events while aggregate APPLY does not exceed the expense", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await applyAllocationV2(repository, apply());

    const second = apply(2);
    second.allocationEventId = "rent-a2";
    second.amount = money(3_000);
    second.occurredAt = "2026-10-04T12:00:00Z";
    const result = await applyAllocationV2(repository, second);

    expect(project(result, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(4_000));
    expect(result.sourceState.moneyMovements.find(x => x.movementId === "expense")?.currentRevisionNo).toBe(1);

    const tooMuch = apply(3);
    tooMuch.allocationEventId = "rent-a3";
    tooMuch.amount = money(1);
    await expect(applyAllocationV2(repository, tooMuch)).rejects.toThrow("Aggregate APPLY exceeds");
  });

  it("allows multiple compatible allocations to cover one expense without exceeding the expense total", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    await applyAllocationV2(repository, apply());

    const second = apply(2);
    second.allocationId = "other";
    second.allocationEventId = "other-a1";
    second.amount = money(2_000);
    const result = await applyAllocationV2(repository, second);
    expect(result.sourceState.allocationEvents.filter(x => x.movementId === "expense")).toHaveLength(2);

    const tooMuch = apply(3);
    tooMuch.allocationId = "other";
    tooMuch.allocationEventId = "other-a2";
    tooMuch.amount = money(1_001);
    await expect(applyAllocationV2(repository, tooMuch)).rejects.toThrow("Aggregate APPLY exceeds");
  });

  it("supports explicit EUR native APPLY without FX inference", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const request = apply();
    request.allocationId = "euro-trip";
    request.allocationEventId = "euro-a1";
    request.movementId = "eur-expense";
    request.amount = money(2_000, "EUR");

    const result = await applyAllocationV2(repository, request);

    expect(result.sourceState.allocationEvents.at(-1)).toMatchObject({
      eventType: "APPLY",
      amount: money(2_000, "EUR"),
      movementId: "eur-expense",
    });
    expect(project(result, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "euro-trip")?.remaining)
      .toEqual(money(3_000, "EUR"));
  });

  it("does not auto-close a fully consumed allocation", async () => {
    const repository = create(), source = workspace();
    source.sourceState.moneyMovementRevisions.find(x => x.movementId === "expense")!.payload =
      { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(10_000), accountId: "bank", description: "Rent paid" };
    await repository.save("owner-a", source, null);
    const request = apply(); request.amount = money(10_000);

    const result = await applyAllocationV2(repository, request);

    expect(result.sourceState.allocations.find(x => x.allocationId === "rent")?.state).toBe("ACTIVE");
    expect(project(result, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(0));
  });

  it("rejects APPLY that over-consumes reserve on its effective day", async () => {
    const repository = create(), source = workspace();
    source.sourceState.moneyMovementRevisions.find(x => x.movementId === "expense")!.payload =
      { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(20_000), accountId: "bank", description: "Rent paid" };
    await repository.save("owner-a", source, null);
    const request = apply(); request.amount = money(10_001);

    await expect(applyAllocationV2(repository, request)).rejects.toThrow("APPLY exceeds reserve");
    expect((await repository.load("owner-a", "home"))?.revision).toBe(1);
  });

  it("rejects backdated APPLY that would make a later reserve state negative", async () => {
    const repository = create(), source = workspace();
    source.sourceState.moneyMovementRevisions.find(x => x.movementId === "expense")!.payload =
      { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(20_000), accountId: "bank", description: "Rent paid" };
    source.sourceState.allocationEvents.push({
      allocationEventId: "rent-later-release",
      allocationId: "rent",
      eventType: "RELEASE",
      amount: money(8_000),
      occurredAt: "2026-10-05T00:00:00Z",
    });
    await repository.save("owner-a", source, null);
    const request = apply(); request.amount = money(3_000); request.occurredAt = "2026-10-02T12:00:00Z";

    await expect(applyAllocationV2(repository, request)).rejects.toThrow("APPLY exceeds reserve");
  });

  it("ignores historical APPLY linked to a VOIDED movement when checking reserve coverage", async () => {
    const repository = create(), source = workspace();
    source.sourceState.moneyMovementRevisions.find(x => x.movementId === "expense")!.payload =
      { movementType: "EXPENSE", occurredOn: "2026-10-02", amount: money(9_000), accountId: "bank", description: "Rent paid" };
    source.sourceState.allocationEvents.push({
      allocationEventId: "old-voided-apply",
      allocationId: "rent",
      eventType: "APPLY",
      amount: money(2_000),
      occurredAt: "2026-10-01T00:00:00Z",
      movementId: "voided-expense",
    });
    await repository.save("owner-a", source, null);
    const request = apply(); request.amount = money(9_000);

    const result = await applyAllocationV2(repository, request);

    expect(result.sourceState.allocationEvents).toContainEqual(source.sourceState.allocationEvents.at(-1));
    expect(project(result, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(1_000));
  });

  it("restores active reserve consumption when the linked expense is later VOIDED, retaining APPLY history", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const applied = await applyAllocationV2(repository, apply());
    expect(project(applied, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(7_000));

    const voided = await voidLinkedMovementV2(repository, {
      ownerPartitionId: "owner-a",
      workspaceId: "home",
      expectedRevision: 2,
      changedAt: "2026-10-04T18:00:00Z",
      movementId: "expense",
      reason: "Cancelled charge",
    });

    expect(voided.sourceState.allocationEvents.find(x => x.allocationEventId === "rent-a1")).toMatchObject({
      eventType: "APPLY",
      movementId: "expense",
    });
    expect(project(voided, "2026-10", "EN").accounts.allocations.find(x => x.allocationId === "rent")?.remaining).toEqual(money(10_000));
    expect(project(voided, "2026-10", "EN").overview.kpis.find(x => x.id === "spending")?.value).toEqual(money(16_000));
  });

  it.each([
    ["missing allocation", (c: ApplyAllocationV2Command) => { c.allocationId = "missing"; }],
    ["missing movement", (c: ApplyAllocationV2Command) => { c.movementId = "missing"; }],
    ["blank allocation id", (c: ApplyAllocationV2Command) => { c.allocationId = " "; }],
    ["blank event id", (c: ApplyAllocationV2Command) => { c.allocationEventId = " "; }],
    ["blank movement id", (c: ApplyAllocationV2Command) => { c.movementId = " "; }],
    ["zero amount", (c: ApplyAllocationV2Command) => { c.amount.amountMinor = 0; }],
    ["negative amount", (c: ApplyAllocationV2Command) => { c.amount.amountMinor = -1; }],
    ["unsafe amount", (c: ApplyAllocationV2Command) => { c.amount.amountMinor = Number.MAX_SAFE_INTEGER + 1; }],
    ["wrong native currency", (c: ApplyAllocationV2Command) => { c.amount.currencyCode = "EUR"; }],
    ["unsupported currency", (c: ApplyAllocationV2Command) => { (c.amount as { currencyCode: string }).currencyCode = "USD"; }],
    ["invalid effective time", (c: ApplyAllocationV2Command) => { c.occurredAt = "2026-02-30T00:00:00Z"; }],
    ["blank note", (c: ApplyAllocationV2Command) => { c.note = " "; }],
    ["INCOME target", (c: ApplyAllocationV2Command) => { c.movementId = "income"; }],
    ["TRANSFER target", (c: ApplyAllocationV2Command) => { c.movementId = "transfer"; }],
    ["VOIDED target", (c: ApplyAllocationV2Command) => { c.movementId = "voided-expense"; }],
    ["different account", (c: ApplyAllocationV2Command) => { c.movementId = "expense-bank2"; }],
  ] as const)("rejects %s without a write", async (_label, mutate) => {
    const repository = create(), original = workspace(), request = apply();
    mutate(request);
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");

    await expect(applyAllocationV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects duplicate event ids atomically", async () => {
    const repository = create(), source = workspace();
    source.sourceState.allocationEvents.push({
      allocationEventId: "rent-a1",
      allocationId: "rent",
      eventType: "RESERVE",
      amount: money(1),
      occurredAt: "2026-09-11T00:00:00Z",
    });
    await repository.save("owner-a", source, null);
    const save = vi.spyOn(repository, "save");

    await expect(applyAllocationV2(repository, apply())).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects an incompatible existing APPLY on the same target movement", async () => {
    const repository = create(), source = workspace();
    source.sourceState.allocationEvents.push({
      allocationEventId: "bad-existing",
      allocationId: "euro-trip",
      eventType: "APPLY",
      amount: money(1_000, "EUR"),
      occurredAt: "2026-10-02T00:00:00Z",
      movementId: "expense",
    });
    await repository.save("owner-a", source, null);

    await expect(applyAllocationV2(repository, apply())).rejects.toThrow("Existing APPLY is incompatible");
  });

  it("rejects movement-linked non-APPLY allocation events as an unsupported dependency", async () => {
    const repository = create(), source = workspace();
    source.sourceState.allocationEvents.push({
      allocationEventId: "bad-link",
      allocationId: "rent",
      eventType: "RESERVE",
      amount: money(1_000),
      occurredAt: "2026-10-02T00:00:00Z",
      movementId: "expense",
    });
    await repository.save("owner-a", source, null);

    await expect(applyAllocationV2(repository, apply())).rejects.toThrow("non-APPLY");
  });

  it("rejects non-ACTIVE allocation", async () => {
    const repository = create(), source = workspace();
    source.sourceState.allocations.find(x => x.allocationId === "rent")!.state = "RELEASED";
    await repository.save("owner-a", source, null);

    await expect(applyAllocationV2(repository, apply())).rejects.toBeInstanceOf(DomainV2ValidationError);
  });

  it("isolates owners and rejects stale workspace revisions", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    const wrongOwner = apply(); wrongOwner.ownerPartitionId = "owner-b";
    await expect(applyAllocationV2(repository, wrongOwner)).rejects.toBeInstanceOf(WorkspaceV2NotFoundError);

    await applyAllocationV2(repository, apply());
    const stale = apply(); stale.allocationEventId = "stale-a";
    await expect(applyAllocationV2(repository, stale)).rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
  });

  it("commits one concurrent APPLY and rejects the competitor without retry", async () => {
    const repository = create(); await repository.save("owner-a", workspace(), null);
    let unlock!: () => void;
    let loads = 0;
    const gate = new Promise<void>(resolve => { unlock = resolve; });
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => {
        const value = await repository.load(owner, id);
        if (++loads === 2) unlock();
        await gate;
        return value;
      },
      save: vi.fn((owner, next, revision) => repository.save(owner, next, revision)),
    };
    const other = apply(); other.allocationEventId = "rent-a2"; other.amount = money(2_000);
    const results = await Promise.allSettled([
      applyAllocationV2(concurrent, apply()),
      applyAllocationV2(concurrent, other),
    ]);

    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect((results.find(x => x.status === "rejected") as PromiseRejectedResult).reason)
      .toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2);
    expect((await repository.load("owner-a", "home"))?.sourceState.allocationEvents.filter(x => x.eventType === "APPLY")).toHaveLength(1);
  });
});

describe("allocation APPLY input and persistence boundaries", () => {
  it("does not mutate loaded source when persistence fails", async () => {
    const original = workspace(), failure = new Error("Storage failed");
    const repository: CashFlowRepositoryV2 = {
      load: vi.fn(async () => original),
      save: vi.fn(async () => { throw failure; }),
    };

    await expect(applyAllocationV2(repository, apply())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(original).toEqual(workspace());
  });

  it("snapshots nested command data before asynchronous load", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();
    await repository.save("owner-a", workspace(), null);
    const request = apply(), original = structuredClone(request);
    const pending = applyAllocationV2(repository, request);

    request.ownerPartitionId = "wrong";
    request.allocationId = "wrong";
    request.movementId = "wrong";
    request.amount.amountMinor = 1;
    request.occurredAt = "2026-10-01T00:00:00Z";
    request.note = "changed";

    const result = await pending;
    expect(result.sourceState.allocationEvents.at(-1)).toMatchObject({
      allocationId: original.allocationId,
      movementId: original.movementId,
      amount: original.amount,
      occurredAt: original.occurredAt,
      note: "Use reserve",
    });
  });
});
