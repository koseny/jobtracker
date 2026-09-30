export type CurrencyCode = "HUF" | "EUR";

export interface Money {
  amountMinor: number;
  currencyCode: CurrencyCode;
}

export type PlanDirection = "INCOME" | "EXPENSE";
export type PlanStatus = "ACTIVE" | "CANCELLED";
export type CompletionStatus = "OPEN" | "COMPLETED";

export type AccountType = "BANK" | "SAVINGS" | "CASH";
export type AccountBalanceAnchorType = "INITIAL" | "RECONCILIATION" | "MIGRATION";

export type MovementType = "INCOME" | "EXPENSE" | "TRANSFER";
export type MovementLifecycleStatus = "ACTIVE" | "VOIDED";

export type AllocationState = "ACTIVE" | "USED" | "RELEASED";
export type AllocationEventType = "RESERVE" | "RELEASE" | "APPLY" | "ADJUST";

export interface OneTimeRecurrenceRule {
  recurrenceRuleId: string;
  kind: "ONE_TIME";
  date: string;
}

export interface MonthlyRecurrenceRule {
  recurrenceRuleId: string;
  kind: "MONTHLY";
  preferredDay?: number;
}

export interface QuarterlyRecurrenceRule {
  recurrenceRuleId: string;
  kind: "QUARTERLY";
  anchorMonth: string;
  preferredDay?: number;
}

export interface WeeklyRecurrenceRule {
  recurrenceRuleId: string;
  kind: "WEEKLY";
}

export interface MultipleWithinMonthRecurrenceRule {
  recurrenceRuleId: string;
  kind: "MULTIPLE_WITHIN_MONTH";
}

export type RecurrenceRule =
  | OneTimeRecurrenceRule
  | MonthlyRecurrenceRule
  | QuarterlyRecurrenceRule
  | WeeklyRecurrenceRule
  | MultipleWithinMonthRecurrenceRule;

export interface PlanTemplate {
  planTemplateId: string;
  name: string;
  direction: PlanDirection;
  defaultPlannedAmount: Money;
  recurrenceRuleId?: string;
  categoryId?: string;
  groupId?: string;
  incomeSourceId?: string;
  active: boolean;
  earliestAllowedDay?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanItem {
  planItemId: string;
  monthId: string;
  direction: PlanDirection;
  name: string;
  currentPlannedAmount: Money;
  planStatus: PlanStatus;
  completionStatus: CompletionStatus;
  planTemplateId?: string;
  recurrenceRuleId?: string;
  categoryId?: string;
  groupId?: string;
  incomeSourceId?: string;
  expectedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRevision {
  planRevisionId: string;
  planItemId: string;
  revisionNo: number;
  plannedAmount: Money;
  changedAt: string;
  reason?: string;
}

export interface Account {
  accountId: string;
  name: string;
  accountType: AccountType;
  currencyCode: CurrencyCode;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountBalanceAnchor {
  accountBalanceAnchorId: string;
  accountId: string;
  anchorType: AccountBalanceAnchorType;
  balance: Money;
  effectiveAt: string;
  note?: string;
}

export interface IncomeExpenseMovementRevisionPayload {
  movementType: "INCOME" | "EXPENSE";
  occurredOn: string;
  amount: Money;
  accountId?: string;
  categoryId?: string;
  description: string;
}

export interface TransferMovementRevisionPayload {
  movementType: "TRANSFER";
  occurredOn: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAmount: Money;
  destinationAmount: Money;
  description: string;
}

export type MovementRevisionPayload =
  | IncomeExpenseMovementRevisionPayload
  | TransferMovementRevisionPayload;

export interface MoneyMovement {
  movementId: string;
  movementType: MovementType;
  lifecycleStatus: MovementLifecycleStatus;
  currentRevisionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyMovementRevision {
  movementRevisionId: string;
  movementId: string;
  revisionNo: number;
  payload: MovementRevisionPayload;
  changedAt: string;
}

export interface PlanRealization {
  planRealizationId: string;
  planItemId: string;
  movementId: string;
  realizedAmount: Money;
  createdAt: string;
}

export interface Allocation {
  allocationId: string;
  accountId: string;
  purpose: string;
  currencyCode: CurrencyCode;
  state: AllocationState;
  linkedPlanItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationEvent {
  allocationEventId: string;
  allocationId: string;
  eventType: AllocationEventType;
  amount: Money;
  occurredAt: string;
  movementId?: string;
  note?: string;
}

export interface DailyEvent {
  dailyEventId: string;
  date: string;
  title: string;
  note?: string;
  movementIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  categoryId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface Group {
  groupId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface IncomeSource {
  incomeSourceId: string;
  name: string;
  sourceType: "SALARY" | "STATE_BENEFIT" | "WORK_CLIENT" | "OTHER";
  unit?: string;
  unitPrice?: Money;
  defaultCurrency: CurrencyCode;
  active: boolean;
}

export interface WorkOccurrence {
  workOccurrenceId: string;
  incomeSourceId: string;
  date: string;
  quantity: number;
  state: "PLANNED" | "COMPLETED";
  note?: string;
}

export interface MonthPeriod {
  monthId: string;
  note?: string;
  status?: string;
}

export interface FxRateQuote {
  fxRateQuoteId: string;
  baseCurrencyCode: CurrencyCode;
  quoteCurrencyCode: CurrencyCode;
  numerator: number;
  denominator: number;
  effectiveMonth: string;
  sourceLabel?: string;
}

export interface MigrationEvidence {
  migrationId: string;
  fromSchemaVersion: number;
  migratedAt: string;
  notes: string[];
}

export interface CashFlowSourceStateV2 {
  accounts: Account[];
  accountBalanceAnchors: AccountBalanceAnchor[];
  planItems: PlanItem[];
  planRevisions: PlanRevision[];
  planTemplates: PlanTemplate[];
  recurrenceRules: RecurrenceRule[];
  incomeSources: IncomeSource[];
  workOccurrences: WorkOccurrence[];
  moneyMovements: MoneyMovement[];
  moneyMovementRevisions: MoneyMovementRevision[];
  planRealizations: PlanRealization[];
  allocations: Allocation[];
  allocationEvents: AllocationEvent[];
  dailyEvents: DailyEvent[];
  categories: Category[];
  groups: Group[];
  monthPeriods: MonthPeriod[];
  fxRateQuotes: FxRateQuote[];
}

export interface CashFlowWorkspaceV2 {
  workspaceId: string;
  ownerPartitionId: string;
  schemaVersion: 2;
  reportingCurrencyCode: CurrencyCode;
  revision: number;
  createdAt: string;
  updatedAt: string;
  sourceState: CashFlowSourceStateV2;
  migrationEvidence?: MigrationEvidence[];
}
