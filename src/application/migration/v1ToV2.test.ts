import { describe, expect, it } from "vitest";
import type { CashFlowWorkspace } from "../../domain/cashFlow";
import { migrateWorkspaceV1ToV2, MigrationV1ToV2Error } from "./v1ToV2";

function legacyWorkspace(ownerPartitionId = "owner-a"): CashFlowWorkspace {
  return {
    workspaceId: "home",
    ownerPartitionId,
    schemaVersion: 1,
    currency: "HUF",
    bufferPolicy: {
      roundingValueHuf: 1_000,
      roundingThresholdHuf: 500,
      applyToFixed: false,
    },
    items: [
      {
        id: "salary",
        name: "Salary",
        direction: "income",
        mode: "bank",
        planningStatus: "planned",
        schedule: { frequency: "monthly" },
        expectedAmountHuf: 500_000,
        expenseType: null,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "groceries",
        name: "Groceries",
        direction: "spending",
        mode: "cash",
        planningStatus: "planned",
        schedule: { frequency: "weekly" },
        estimatedAmountHuf: 35_000,
        expenseType: "variable",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
      {
        id: "insurance",
        name: "Insurance",
        direction: "spending",
        mode: "bank",
        planningStatus: "scheduled",
        schedule: { frequency: "oneTime", date: "2026-10-15" },
        estimatedAmountHuf: 120_000,
        expenseType: "fixed",
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
      },
    ],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-29T00:00:00Z",
  };
}

describe("v1→v2 migration candidate", () => {
  it("migrates valid planning data deterministically without mutating the source", () => {
    const source = legacyWorkspace();
    const before = structuredClone(source);

    const first = migrateWorkspaceV1ToV2(source, "owner-a", "2026-09-30T12:00:00Z");
    const second = migrateWorkspaceV1ToV2(source, "owner-a", "2026-09-30T12:00:00Z");

    expect(first).toEqual(second);
    expect(source).toEqual(before);
    expect(first.schemaVersion).toBe(2);
    expect(first.reportingCurrencyCode).toBe("HUF");
    expect(first.sourceState.planTemplates).toHaveLength(3);
    expect(first.sourceState.recurrenceRules.map(x => x.kind)).toEqual([
      "MONTHLY",
      "WEEKLY",
      "ONE_TIME",
    ]);
    expect(first.sourceState.planItems).toEqual([
      expect.objectContaining({
        planItemId: "legacy-plan:insurance",
        monthId: "2026-10",
        currentPlannedAmount: { amountMinor: 120_000, currencyCode: "HUF" },
      }),
    ]);
  });

  it("preserves legacy plan values but excludes BufferPolicy from canonical v2 state", () => {
    const migrated = migrateWorkspaceV1ToV2(
      legacyWorkspace(),
      "owner-a",
      "2026-09-30T12:00:00Z",
    );

    expect(migrated.sourceState.planTemplates[0].defaultPlannedAmount).toEqual({
      amountMinor: 500_000,
      currencyCode: "HUF",
    });
    expect(JSON.stringify(migrated.sourceState)).not.toContain("bufferPolicy");
    expect(JSON.stringify(migrated.sourceState)).not.toContain("roundingValueHuf");
    expect(migrated.migrationEvidence?.[0].notes.join(" ")).toContain(
      "BufferPolicy intentionally excluded",
    );
  });

  it("does not invent Account records from legacy bank/cash mode", () => {
    const migrated = migrateWorkspaceV1ToV2(
      legacyWorkspace(),
      "owner-a",
      "2026-09-30T12:00:00Z",
    );

    expect(migrated.sourceState.accounts).toEqual([]);
    expect(migrated.migrationEvidence?.[0].notes.join(" ")).toContain(
      "does not create Account records",
    );
  });

  it("rejects access from a different owner partition", () => {
    const source = legacyWorkspace("owner-a");
    expect(() =>
      migrateWorkspaceV1ToV2(source, "owner-b", "2026-09-30T12:00:00Z"),
    ).toThrow(MigrationV1ToV2Error);
  });

  it("rejects invalid legacy data and leaves the original source unchanged", () => {
    const source = legacyWorkspace();
    source.items[0] = { ...source.items[0], name: " " };
    const before = structuredClone(source);

    expect(() =>
      migrateWorkspaceV1ToV2(source, "owner-a", "2026-09-30T12:00:00Z"),
    ).toThrow(MigrationV1ToV2Error);
    expect(source).toEqual(before);
  });

  it("never creates actual MoneyMovements during recurrence migration", () => {
    const migrated = migrateWorkspaceV1ToV2(
      legacyWorkspace(),
      "owner-a",
      "2026-09-30T12:00:00Z",
    );

    expect(migrated.sourceState.moneyMovements).toEqual([]);
    expect(migrated.sourceState.moneyMovementRevisions).toEqual([]);
    expect(migrated.sourceState.planRealizations).toEqual([]);
  });
});
