export type CurrencyCode = "HUF";
export type CashFlowDirection = "income" | "spending";
export type CashFlowMode = "bank" | "cash";
export type PlanningStatus = "scheduled" | "planned" | "unplanned";
export type ExpenseType = "fixed" | "variable";

export type CashFlowSchedule =
  | { frequency: "monthly" }
  | { frequency: "weekly" }
  | { frequency: "oneTime"; date: string };

interface CashFlowItemBase {
  id: string;
  name: string;
  direction: CashFlowDirection;
  mode: CashFlowMode;
  planningStatus: PlanningStatus;
  schedule: CashFlowSchedule;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeItem extends CashFlowItemBase {
  direction: "income";
  expectedAmountHuf: number;
  expenseType: null;
}

export interface SpendingItem extends CashFlowItemBase {
  direction: "spending";
  estimatedAmountHuf: number;
  expenseType: ExpenseType;
}

export type CashFlowItem = IncomeItem | SpendingItem;

export interface BufferPolicy {
  roundingValueHuf: number;
  roundingThresholdHuf: number;
  applyToFixed: boolean;
}

export interface CashFlowWorkspace {
  workspaceId: string;
  ownerPartitionId: string;
  schemaVersion: number;
  currency: CurrencyCode;
  bufferPolicy: BufferPolicy;
  items: CashFlowItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CashFlowRepository {
  load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspace | null>;
  save(workspace: CashFlowWorkspace): Promise<void>;
}
