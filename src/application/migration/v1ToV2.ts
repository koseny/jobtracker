import type {
  CashFlowItem,
  CashFlowSchedule,
  CashFlowWorkspace,
} from "../../domain/cashFlow";
import { validateBufferPolicy, validateItem } from "../../domain/validation";
import type {
  CashFlowWorkspaceV2,
  Money,
  PlanDirection,
  PlanItem,
  PlanTemplate,
  RecurrenceRule,
} from "../../domain/v2/cashFlowV2";
import {
  emptySourceStateV2,
  validateWorkspaceV2,
} from "../../domain/v2/validationV2";

export class MigrationV1ToV2Error extends Error {}

function moneyFromLegacyHuf(amountHuf: number): Money {
  return { amountMinor: amountHuf, currencyCode: "HUF" };
}

function directionFromLegacy(item: CashFlowItem): PlanDirection {
  return item.direction === "income" ? "INCOME" : "EXPENSE";
}

function amountFromLegacy(item: CashFlowItem): Money {
  return moneyFromLegacyHuf(
    item.direction === "income" ? item.expectedAmountHuf : item.estimatedAmountHuf,
  );
}

function recurrenceFromLegacy(itemId: string, schedule: CashFlowSchedule): RecurrenceRule {
  const recurrenceRuleId = `legacy-recurrence:${itemId}`;
  switch (schedule.frequency) {
    case "monthly":
      return { recurrenceRuleId, kind: "MONTHLY" };
    case "weekly":
      return { recurrenceRuleId, kind: "WEEKLY" };
    case "oneTime":
      return { recurrenceRuleId, kind: "ONE_TIME", date: schedule.date };
  }
}

function templateFromLegacy(item: CashFlowItem, recurrenceRuleId: string): PlanTemplate {
  return {
    planTemplateId: `legacy-template:${item.id}`,
    name: item.name,
    direction: directionFromLegacy(item),
    defaultPlannedAmount: amountFromLegacy(item),
    recurrenceRuleId,
    active: true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function oneTimePlanItemFromLegacy(
  item: CashFlowItem,
  template: PlanTemplate,
  recurrence: RecurrenceRule,
  sortOrder: number,
): PlanItem | null {
  if (recurrence.kind !== "ONE_TIME") return null;
  return {
    planItemId: `legacy-plan:${item.id}`,
    monthId: recurrence.date.slice(0, 7),
    direction: template.direction,
    sortOrder,
    name: template.name,
    currentPlannedAmount: template.defaultPlannedAmount,
    planStatus: "ACTIVE",
    completionStatus: "OPEN",
    planTemplateId: template.planTemplateId,
    recurrenceRuleId: recurrence.recurrenceRuleId,
    expectedDate: recurrence.date,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function validateLegacyWorkspace(source: CashFlowWorkspace): void {
  if (source.schemaVersion !== 1) {
    throw new MigrationV1ToV2Error("Only schemaVersion 1 workspaces can use the v1→v2 migration.");
  }
  if (source.currency !== "HUF") {
    throw new MigrationV1ToV2Error("Legacy migration only accepts the deployed HUF v1 workspace shape.");
  }

  try {
    validateBufferPolicy(source.bufferPolicy);
    source.items.forEach(validateItem);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Legacy workspace validation failed.";
    throw new MigrationV1ToV2Error(message);
  }

  const ids = new Set<string>();
  for (const item of source.items) {
    if (ids.has(item.id)) {
      throw new MigrationV1ToV2Error(`Duplicate legacy item id: ${item.id}.`);
    }
    ids.add(item.id);
  }
}

export function migrateWorkspaceV1ToV2(
  source: CashFlowWorkspace,
  activeOwnerPartitionId: string,
  migratedAt: string,
): CashFlowWorkspaceV2 {
  if (source.ownerPartitionId !== activeOwnerPartitionId) {
    throw new MigrationV1ToV2Error("Legacy workspace does not belong to the active owner partition.");
  }

  validateLegacyWorkspace(source);

  const sourceState = emptySourceStateV2();
  const evidenceNotes = [
    "Legacy BufferPolicy intentionally excluded from canonical v2 source state.",
    "Legacy bank/cash item mode does not create Account records.",
    "Legacy HUF integer planning values map directly to v2 HUF amountMinor values.",
  ];

  for (const item of source.items) {
    const recurrence = recurrenceFromLegacy(item.id, item.schedule);
    const template = templateFromLegacy(item, recurrence.recurrenceRuleId);
    const sortOrder = sourceState.planItems.filter(plan =>
      plan.monthId === (recurrence.kind === "ONE_TIME" ? recurrence.date.slice(0, 7) : "") &&
      plan.direction === template.direction
    ).length;
    const oneTimePlanItem = oneTimePlanItemFromLegacy(item, template, recurrence, sortOrder);

    sourceState.recurrenceRules.push(recurrence);
    sourceState.planTemplates.push(template);
    if (oneTimePlanItem) sourceState.planItems.push(oneTimePlanItem);

    evidenceNotes.push(
      `Legacy item ${item.id}: mode=${item.mode}, planningStatus=${item.planningStatus}; preserved as migration evidence only.`,
    );
  }

  const candidate: CashFlowWorkspaceV2 = {
    workspaceId: source.workspaceId,
    ownerPartitionId: source.ownerPartitionId,
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision: 1,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    sourceState,
    migrationEvidence: [
      {
        migrationId: "legacy-v1-to-v2",
        fromSchemaVersion: 1,
        migratedAt,
        notes: evidenceNotes,
      },
    ],
  };

  validateWorkspaceV2(candidate);
  return candidate;
}
