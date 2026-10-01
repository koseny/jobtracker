import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import {
  type CashFlowRepositoryV2,
  WorkspaceV2NotFoundError,
  WorkspaceV2OwnershipError,
  WorkspaceV2RevisionConflictError,
} from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../features/readModel/projectWorkspaceV2";
import { createActualMovementV2, type CreateActualMovementV2Command } from "./createActualMovementV2";
import { executeWorkspaceV2Command } from "./executeWorkspaceV2Command";

const createdAt = "2026-09-01T00:00:00Z";

function workspace(ownerPartitionId = "owner-a"): CashFlowWorkspaceV2 {
  const sourceState = emptySourceStateV2();
  sourceState.accounts.push({
    accountId: "bank", name: "Bank", accountType: "BANK", currencyCode: "HUF",
    active: true, createdAt, updatedAt: createdAt,
  });
  sourceState.accountBalanceAnchors.push({
    accountBalanceAnchorId: "initial", accountId: "bank", anchorType: "INITIAL",
    balance: { amountMinor: 10_000, currencyCode: "HUF" }, effectiveAt: createdAt,
  });
  sourceState.categories.push({ categoryId: "category", name: "My label", sortOrder: 1, active: true });
  return {
    workspaceId: "home", ownerPartitionId, schemaVersion: 2, reportingCurrencyCode: "HUF",
    revision: 1, createdAt, updatedAt: createdAt, sourceState,
  };
}

function command(overrides: Partial<CreateActualMovementV2Command> = {}): CreateActualMovementV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 1,
    changedAt: "2026-10-01T12:00:00Z", movementId: "actual", movementRevisionId: "actual-r1",
    payload: {
      movementType: "INCOME", occurredOn: "2026-10-01", description: "Actual receipt",
      amount: { amountMinor: 2_500, currencyCode: "HUF" }, accountId: "bank", categoryId: "category",
    },
    ...overrides,
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal(
    "hcf-v2-command-test", new IDBFactory(),
  ) },
];

describe.each(repositories)("dormant v2 commands — $name", ({ create }) => {
  it.each(["INCOME", "EXPENSE"] as const)("atomically creates %s and projects native financial effects", async movementType => {
    const repository = create();
    const original = workspace();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const request = command();
    request.payload.movementType = movementType;
    const result = await createActualMovementV2(repository, request);
    expect(save).toHaveBeenCalledExactlyOnceWith("owner-a", result, 1);
    expect(result).toMatchObject({ revision: 2, createdAt, updatedAt: request.changedAt });
    expect(result.sourceState.moneyMovements).toEqual([{
      movementId: "actual", movementType, lifecycleStatus: "ACTIVE", currentRevisionNo: 1,
      createdAt: request.changedAt, updatedAt: request.changedAt,
    }]);
    expect(result.sourceState.moneyMovementRevisions).toEqual([{
      movementRevisionId: "actual-r1", movementId: "actual", revisionNo: 1,
      payload: request.payload, changedAt: request.changedAt,
    }]);
    for (const key of Object.keys(original.sourceState) as (keyof typeof original.sourceState)[]) {
      if (key !== "moneyMovements" && key !== "moneyMovementRevisions") {
        expect(result.sourceState[key]).toEqual(original.sourceState[key]);
      }
    }
    expect(original).toEqual(workspace());
    const persisted = (await repository.load("owner-a", "home"))!;
    expect(persisted).toEqual(result);
    const model = projectWorkspaceV2ToOperationalViewModels(persisted, "2026-10", "EN");
    expect(model.overview.kpis.find(x => x.id === (movementType === "INCOME" ? "income" : "spending"))?.value)
      .toEqual({ amountMinor: 2_500, currencyCode: "HUF" });
    expect(model.accounts.accounts[0].position.amountMinor).toBe(movementType === "INCOME" ? 12_500 : 7_500);
    expect(model.accounts.accounts[0].free).toEqual(model.accounts.accounts[0].position);
    expect(model.transactionRows[0]).toMatchObject({ movementId: "actual", lifecycleStatus: "ACTIVE" });
    expect(model.calendar.days.find(day => day.date === "2026-10-01")?.entries)
      .toContainEqual(expect.objectContaining({ id: "actual", kind: `ACTUAL_${movementType}` }));
    result.sourceState.moneyMovementRevisions[0].payload.description = "Caller edit";
    expect((await repository.load("owner-a", "home"))!).toEqual(persisted);
  });

  it("keeps account/category optional, permits zero, and does not invent FX", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    delete request.payload.accountId;
    delete request.payload.categoryId;
    request.payload.amount = { amountMinor: 0, currencyCode: "EUR" };
    const zero = await createActualMovementV2(repository, request);
    expect(zero.sourceState.moneyMovementRevisions[0].payload).toEqual(request.payload);
    request.expectedRevision = 2;
    request.movementId = "eur";
    request.movementRevisionId = "eur-r1";
    request.payload.amount.amountMinor = 1_234;
    const result = await createActualMovementV2(repository, request);
    const model = projectWorkspaceV2ToOperationalViewModels(result, "2026-10", "EN");
    expect(model.accounts.accounts[0].position.amountMinor).toBe(10_000);
    expect(model.overview.kpis.find(x => x.id === "income")).toMatchObject({ value: null, incomplete: true });
    expect(model.transactionRows.find(x => x.movementId === "eur")?.amount).toEqual(request.payload.amount);
    expect(result.sourceState.fxRateQuotes).toEqual([]);
  });

  it("isolates owners with the same workspace id and does not create missing workspaces", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    await expect(createActualMovementV2(repository, command({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    await repository.save("owner-b", workspace("owner-b"), null);
    await createActualMovementV2(repository, command({ ownerPartitionId: "owner-b" }));
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
    expect((await repository.load("owner-b", "home"))?.revision).toBe(2);
  });

  it.each(["movementId", "movementRevisionId"] as const)("rejects duplicate %s without partial writes", async duplicate => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const original = await createActualMovementV2(repository, command());
    const request = command({ expectedRevision: 2, movementId: "second", movementRevisionId: "second-r1" });
    request[duplicate] = command()[duplicate];
    const save = vi.spyOn(repository, "save");
    await expect(createActualMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it.each(["movementId", "movementRevisionId"] as const)("rejects blank %s without saving", async id => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    request[id] = " ";
    const save = vi.spyOn(repository, "save");
    await expect(createActualMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(workspace());
  });

  it.each([
    ["negative amount", { amount: { amountMinor: -1, currencyCode: "HUF" } }],
    ["fractional amount", { amount: { amountMinor: 0.5, currencyCode: "HUF" } }],
    ["unsafe amount", { amount: { amountMinor: Number.MAX_SAFE_INTEGER + 1, currencyCode: "HUF" } }],
    ["currency mismatch", { amount: { amountMinor: 1, currencyCode: "EUR" } }],
    ["invalid date", { occurredOn: "2026-02-30" }],
    ["missing account", { accountId: "missing" }],
    ["blank account", { accountId: " " }],
    ["missing category", { categoryId: "missing" }],
    ["unsupported transfer", { movementType: "TRANSFER" }],
  ])("rejects %s before saving", async (_label, payloadChanges) => {
    const repository = create();
    const original = workspace();
    await repository.save("owner-a", original, null);
    const save = vi.spyOn(repository, "save");
    const request = command();
    Object.assign(request.payload, payloadChanges);
    await expect(createActualMovementV2(repository, request)).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(original);
  });

  it("rejects a stale caller revision without saving", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const current = await createActualMovementV2(repository, command());
    const save = vi.spyOn(repository, "save");
    await expect(createActualMovementV2(repository, command({ movementId: "stale", movementRevisionId: "stale-r1" })))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(save).not.toHaveBeenCalled();
    await expect(repository.load("owner-a", "home")).resolves.toEqual(current);
  });

  it("allows only one concurrent writer and preserves the complete winning pair", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    let release!: () => void;
    const bothLoaded = new Promise<void>(resolve => { release = resolve; });
    let loadCount = 0;
    const concurrent: CashFlowRepositoryV2 = {
      load: async (owner, id) => {
        const snapshot = await repository.load(owner, id);
        if (++loadCount === 2) release();
        await bothLoaded;
        return snapshot;
      },
      save: vi.fn((owner, next, expected) => repository.save(owner, next, expected)),
    };
    const results = await Promise.allSettled([
      createActualMovementV2(concurrent, command()),
      createActualMovementV2(concurrent, command({ movementId: "other", movementRevisionId: "other-r1" })),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WorkspaceV2RevisionConflictError);
    expect(concurrent.save).toHaveBeenCalledTimes(2); // No automatic retry.
    const persisted = (await repository.load("owner-a", "home"))!;
    const winner = results.find(result => result.status === "fulfilled") as PromiseFulfilledResult<CashFlowWorkspaceV2>;
    expect(persisted).toEqual(winner.value);
    expect(persisted.revision).toBe(2);
    expect(persisted.sourceState.moneyMovements).toHaveLength(1);
    expect(persisted.sourceState.moneyMovementRevisions).toHaveLength(1);
  });

  it("does not guess ordering for a new actual on the anchor's date", async () => {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    request.payload.occurredOn = "2026-09-01";
    const result = await createActualMovementV2(repository, request);
    expect(() => projectWorkspaceV2ToOperationalViewModels(result, "2026-10", "EN"))
      .toThrow("same calendar date");
    expect(result.sourceState.accountBalanceAnchors).toEqual(workspace().sourceState.accountBalanceAnchors);
  });
});

describe("v2 command execution boundary", () => {
  it.each([
    ["wrong owner", (value: CashFlowWorkspaceV2) => { value.ownerPartitionId = "other"; }, WorkspaceV2OwnershipError],
    ["wrong workspace", (value: CashFlowWorkspaceV2) => { value.workspaceId = "other"; }, WorkspaceV2NotFoundError],
    ["invalid stored state", (value: CashFlowWorkspaceV2) => { value.revision = 0; }, DomainV2ValidationError],
  ] as const)("rejects %s returned by a repository", async (_label, alter, error) => {
    const loaded = workspace();
    alter(loaded);
    const repository = { load: vi.fn(async () => loaded), save: vi.fn() };
    await expect(createActualMovementV2(repository, command())).rejects.toBeInstanceOf(error);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    { expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER },
    { ownerPartitionId: " " }, { workspaceId: "" }, { changedAt: "2026-02-30T12:00:00Z" },
    { changedAt: "2026-10-01" }, { changedAt: "2026-10-01T12:00:00" },
  ])("rejects invalid command context %j before loading", async changes => {
    const repository = { load: vi.fn(), save: vi.fn() };
    await expect(createActualMovementV2(repository, command(changes))).rejects.toBeInstanceOf(Error);
    expect(repository.load).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("leaves repository-owned state untouched if persistence fails", async () => {
    const loaded = workspace();
    const failure = new Error("Storage unavailable");
    const repository = { load: vi.fn(async () => loaded), save: vi.fn(async () => { throw failure; }) };
    await expect(createActualMovementV2(repository, command())).rejects.toBe(failure);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(loaded).toEqual(workspace());
  });

  it("validates transformed state before save and isolates even a mutating transform", async () => {
    const loaded = workspace();
    const repository = { load: vi.fn(async () => loaded), save: vi.fn() };
    await expect(executeWorkspaceV2Command(repository, command(), source => {
      source.accounts.length = 0; // The retained anchor now has no account.
      return source;
    })).rejects.toBeInstanceOf(DomainV2ValidationError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(loaded).toEqual(workspace());
  });

  it("snapshots caller ids, owner, revision, time and payload before asynchronous loading", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();
    await repository.save("owner-a", workspace(), null);
    const request = command();
    const original = structuredClone(request);
    const pending = createActualMovementV2(repository, request);
    request.ownerPartitionId = "other";
    request.workspaceId = "other";
    request.expectedRevision = 9;
    request.changedAt = "2030-01-01T00:00:00Z";
    request.movementId = "changed";
    request.payload.amount.amountMinor = 999;
    const result = await pending;
    expect(result).toMatchObject({ ownerPartitionId: "owner-a", workspaceId: "home", revision: 2, updatedAt: original.changedAt });
    expect(result.sourceState.moneyMovementRevisions[0]).toMatchObject({ movementId: original.movementId, payload: original.payload });
    await expect(repository.load("other", "other")).resolves.toBeNull();
  });
});
