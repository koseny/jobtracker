import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import type { CashFlowWorkspaceV2, PlanDirection } from "../domain/v2/cashFlowV2";
import { WorkspaceV2NotFoundError, WorkspaceV2RevisionConflictError } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError, emptySourceStateV2, validateWorkspaceV2 } from "../domain/v2/validationV2";
import { projectWorkspaceV2ToOperationalViewModels } from "../features/readModel/projectWorkspaceV2";
import { cancelPlanItemV2 } from "./cancelPlanItemV2";
import { createPlanItemV2 } from "./createPlanItemV2";
import { movePlanItemV2, planMoveAvailability, type MovePlanItemV2Command } from "./movePlanItemV2";

const createdAt = "2026-10-01T12:00:00Z";
const changedAt = "2026-10-02T12:00:00Z";

function workspace(): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 2,
    reportingCurrencyCode: "HUF", revision: 1, createdAt, updatedAt: createdAt,
    sourceState: emptySourceStateV2(),
  };
}

function move(overrides: Partial<MovePlanItemV2Command> = {}): MovePlanItemV2Command {
  return {
    ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 6,
    changedAt, planItemId: "expense-b", move: "DOWN", ...overrides,
  };
}

const repositories = [
  { name: "memory", create: () => new InMemoryCashFlowRepositoryV2() },
  { name: "IndexedDB rehearsal", create: () => new IndexedDbCashFlowRepositoryV2Rehearsal(
    "hcf-v2-plan-order-test", new IDBFactory(),
  ) },
];

describe.each(repositories)("dormant v2 plan order — $name", ({ create }) => {
  async function seeded() {
    const repository = create();
    await repository.save("owner-a", workspace(), null);
    const items: [string, string, PlanDirection][] = [
      ["expense-a", "2026-10", "EXPENSE"],
      ["income-a", "2026-10", "INCOME"],
      ["expense-b", "2026-10", "EXPENSE"],
      ["expense-other-month", "2026-11", "EXPENSE"],
      ["expense-c", "2026-10", "EXPENSE"],
    ];
    for (const [index, [planItemId, monthId, direction]] of items.entries()) {
      await createPlanItemV2(repository, {
        ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: index + 1,
        changedAt: createdAt, planItemId,
        item: { monthId, direction, name: planItemId,
          currentPlannedAmount: { amountMinor: 1_000 * (index + 1), currencyCode: "HUF" } },
      });
    }
    return repository;
  }

  it("appends per month and direction, then moves adjacent active plans without changing totals", async () => {
    const repository = await seeded();
    const before = (await repository.load("owner-a", "home"))!;
    expect(before.sourceState.planItems.map(item => [item.planItemId, item.sortOrder])).toEqual([
      ["expense-a", 0], ["income-a", 0], ["expense-b", 1],
      ["expense-other-month", 0], ["expense-c", 2],
    ]);
    const beforeModel = projectWorkspaceV2ToOperationalViewModels(before, "2026-10", "EN");
    const saved = await movePlanItemV2(repository, move());
    expect(saved.revision).toBe(7);
    expect(saved.sourceState.planItems.map(item => [item.planItemId, item.sortOrder])).toEqual([
      ["expense-a", 0], ["income-a", 0], ["expense-b", 2],
      ["expense-other-month", 0], ["expense-c", 1],
    ]);
    expect(saved.sourceState.planItems.filter(item => item.updatedAt === changedAt).map(item => item.planItemId))
      .toEqual(["expense-b", "expense-c"]);
    expect(saved.sourceState.moneyMovements).toEqual([]);
    expect(saved.sourceState.planRevisions).toEqual([]);
    const model = projectWorkspaceV2ToOperationalViewModels(saved, "2026-10", "EN");
    expect(model.month.spendingGroups.flatMap(group => group.rows).map(row => row.id))
      .toEqual(["expense-a", "expense-c", "expense-b"]);
    expect(model.month.incomeGroups).toEqual(beforeModel.month.incomeGroups);
    expect(model.overview.kpis).toEqual(beforeModel.overview.kpis);
    expect(await repository.load("owner-a", "home")).toEqual(saved);

    const restored = await movePlanItemV2(repository, move({ expectedRevision: 7, move: "UP" }));
    expect(projectWorkspaceV2ToOperationalViewModels(restored, "2026-10", "EN")
      .month.spendingGroups.flatMap(group => group.rows).map(row => row.id))
      .toEqual(["expense-a", "expense-b", "expense-c"]);
  });

  it("skips cancelled items without erasing their historical order", async () => {
    const repository = await seeded();
    const cancelled = await cancelPlanItemV2(repository, {
      ownerPartitionId: "owner-a", workspaceId: "home", expectedRevision: 6,
      changedAt, planItemId: "expense-b",
    });
    const saved = await movePlanItemV2(repository, move({
      expectedRevision: 7, planItemId: "expense-c", move: "UP",
    }));
    expect(saved.sourceState.planItems.map(item => [item.planItemId, item.sortOrder])).toEqual([
      ["expense-a", 2], ["income-a", 0], ["expense-b", 1],
      ["expense-other-month", 0], ["expense-c", 0],
    ]);
    expect(saved.sourceState.planItems.find(item => item.planItemId === "expense-b"))
      .toEqual(cancelled.sourceState.planItems.find(item => item.planItemId === "expense-b"));
    expect(projectWorkspaceV2ToOperationalViewModels(saved, "2026-10", "EN")
      .month.spendingGroups.flatMap(group => group.rows).map(row => row.id))
      .toEqual(["expense-c", "expense-a"]);
    expect(planMoveAvailability(saved.sourceState, "expense-c")).toEqual({ UP: false, DOWN: true });
    expect(planMoveAvailability(saved.sourceState, "expense-b")).toEqual({ UP: false, DOWN: false });
  });

  it("rejects invalid orders, edge moves and cross-scope movement without saving", async () => {
    const repository = await seeded();
    const before = (await repository.load("owner-a", "home"))!;
    for (const badOrder of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined]) {
      const bad = structuredClone(before);
      (bad.sourceState.planItems[2] as { sortOrder?: number }).sortOrder = badOrder;
      expect(() => validateWorkspaceV2(bad)).toThrow(DomainV2ValidationError);
    }
    const duplicate = structuredClone(before);
    duplicate.sourceState.planItems[2].sortOrder = 0;
    expect(() => validateWorkspaceV2(duplicate)).toThrow("unique per month and direction");

    const save = vi.spyOn(repository, "save");
    for (const change of [
      { planItemId: " " }, { planItemId: "missing" },
      { planItemId: "expense-a", move: "UP" as const },
      { planItemId: "expense-c", move: "DOWN" as const },
      { planItemId: "income-a", move: "DOWN" as const },
      { planItemId: "expense-other-month", move: "UP" as const },
      { move: "SIDEWAYS" as "UP" },
    ]) {
      await expect(movePlanItemV2(repository, move(change)))
        .rejects.toBeInstanceOf(DomainV2ValidationError);
    }
    expect(save).not.toHaveBeenCalled();
    expect(await repository.load("owner-a", "home")).toEqual(before);
  });

  it("isolates owners and preserves state across conflicts and failed saves", async () => {
    const repository = await seeded();
    await expect(movePlanItemV2(repository, move({ ownerPartitionId: "owner-b" })))
      .rejects.toBeInstanceOf(WorkspaceV2NotFoundError);
    const first = await movePlanItemV2(repository, move());
    await expect(movePlanItemV2(repository, move({ move: "UP" })))
      .rejects.toBeInstanceOf(WorkspaceV2RevisionConflictError);
    vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("storage failure"));
    await expect(movePlanItemV2(repository, move({ expectedRevision: 7, move: "UP" })))
      .rejects.toThrow("storage failure");
    expect(await repository.load("owner-a", "home")).toEqual(first);
  });
});
