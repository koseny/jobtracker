import { isValidIsoDate } from "../time";
import type {
  Account,
  CashFlowSourceStateV2,
  CashFlowWorkspaceV2,
  CurrencyCode,
  Money,
  MoneyMovementRevision,
  RecurrenceRule,
} from "./cashFlowV2";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SUPPORTED_CURRENCIES = new Set<CurrencyCode>(["HUF", "EUR"]);

export class DomainV2ValidationError extends Error {}

export function emptySourceStateV2(): CashFlowSourceStateV2 {
  return {
    accounts: [],
    accountBalanceAnchors: [],
    planItems: [],
    planRevisions: [],
    planTemplates: [],
    recurrenceRules: [],
    incomeSources: [],
    workOccurrences: [],
    moneyMovements: [],
    moneyMovementRevisions: [],
    planRealizations: [],
    allocations: [],
    allocationEvents: [],
    dailyEvents: [],
    categories: [],
    groups: [],
    monthPeriods: [],
    fxRateQuotes: [],
  };
}

function requiredText(value: string, label: string): void {
  if (!value.trim()) throw new DomainV2ValidationError(`${label} is required.`);
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainV2ValidationError(`${label} must be a positive integer.`);
  }
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainV2ValidationError(`${label} must be a non-negative integer.`);
  }
}

function validMonth(value: string, label: string): void {
  if (!MONTH_PATTERN.test(value)) {
    throw new DomainV2ValidationError(`${label} must use YYYY-MM.`);
  }
}

function uniqueIds<T>(items: T[], idOf: (item: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    requiredText(id, `${label} id`);
    if (seen.has(id)) throw new DomainV2ValidationError(`Duplicate ${label} id: ${id}.`);
    seen.add(id);
  }
}

export function validateCurrencyCode(currencyCode: CurrencyCode): void {
  if (!SUPPORTED_CURRENCIES.has(currencyCode)) {
    throw new DomainV2ValidationError(`Unsupported R1 currency: ${String(currencyCode)}.`);
  }
}

export function validateMoney(money: Money, label = "Money"): void {
  validateCurrencyCode(money.currencyCode);
  if (!Number.isInteger(money.amountMinor)) {
    throw new DomainV2ValidationError(`${label} amountMinor must be an integer.`);
  }
}

function validateNonNegativeMoney(money: Money, label: string): void {
  validateMoney(money, label);
  nonNegativeInteger(money.amountMinor, `${label} amountMinor`);
}

function validatePreferredDay(day: number | undefined, label: string): void {
  if (day === undefined) return;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DomainV2ValidationError(`${label} must be an integer from 1 to 31.`);
  }
}

function validateRecurrenceRule(rule: RecurrenceRule): void {
  requiredText(rule.recurrenceRuleId, "RecurrenceRule id");
  switch (rule.kind) {
    case "ONE_TIME":
      if (!isValidIsoDate(rule.date)) {
        throw new DomainV2ValidationError("ONE_TIME recurrence date must be a real YYYY-MM-DD date.");
      }
      break;
    case "MONTHLY":
      validatePreferredDay(rule.preferredDay, "MONTHLY preferredDay");
      break;
    case "QUARTERLY":
      validMonth(rule.anchorMonth, "QUARTERLY anchorMonth");
      validatePreferredDay(rule.preferredDay, "QUARTERLY preferredDay");
      break;
    case "WEEKLY":
    case "MULTIPLE_WITHIN_MONTH":
      break;
  }
}

function accountById(accounts: Account[]): Map<string, Account> {
  return new Map(accounts.map(account => [account.accountId, account]));
}

function validateMovementRevision(
  revision: MoneyMovementRevision,
  accounts: Map<string, Account>,
): void {
  positiveInteger(revision.revisionNo, "MoneyMovementRevision revisionNo");

  const payload = revision.payload;
  if (!isValidIsoDate(payload.occurredOn)) {
    throw new DomainV2ValidationError("MoneyMovementRevision occurredOn must be a real YYYY-MM-DD date.");
  }

  if (payload.movementType === "TRANSFER") {
    requiredText(payload.sourceAccountId, "Transfer sourceAccountId");
    requiredText(payload.destinationAccountId, "Transfer destinationAccountId");
    if (payload.sourceAccountId === payload.destinationAccountId) {
      throw new DomainV2ValidationError("Transfer source and destination accounts must differ.");
    }
    const source = accounts.get(payload.sourceAccountId);
    const destination = accounts.get(payload.destinationAccountId);
    if (!source || !destination) {
      throw new DomainV2ValidationError("Transfer accounts must exist.");
    }
    validateNonNegativeMoney(payload.sourceAmount, "Transfer sourceAmount");
    validateNonNegativeMoney(payload.destinationAmount, "Transfer destinationAmount");
    if (payload.sourceAmount.currencyCode !== source.currencyCode) {
      throw new DomainV2ValidationError("Transfer source currency must match source account currency.");
    }
    if (payload.destinationAmount.currencyCode !== destination.currencyCode) {
      throw new DomainV2ValidationError("Transfer destination currency must match destination account currency.");
    }
    return;
  }

  validateNonNegativeMoney(payload.amount, "Movement amount");
  if (payload.accountId) {
    const account = accounts.get(payload.accountId);
    if (!account) throw new DomainV2ValidationError("Movement account must exist.");
    if (payload.amount.currencyCode !== account.currencyCode) {
      throw new DomainV2ValidationError("Movement currency must match account currency.");
    }
  }
}

export function validateWorkspaceV2(workspace: CashFlowWorkspaceV2): void {
  requiredText(workspace.workspaceId, "Workspace id");
  requiredText(workspace.ownerPartitionId, "Owner partition id");
  if (workspace.schemaVersion !== 2) {
    throw new DomainV2ValidationError("Canonical workspace schemaVersion must be 2.");
  }
  validateCurrencyCode(workspace.reportingCurrencyCode);
  positiveInteger(workspace.revision, "Workspace revision");

  const s = workspace.sourceState;
  uniqueIds(s.accounts, x => x.accountId, "Account");
  uniqueIds(s.accountBalanceAnchors, x => x.accountBalanceAnchorId, "AccountBalanceAnchor");
  uniqueIds(s.planItems, x => x.planItemId, "PlanItem");
  uniqueIds(s.planRevisions, x => x.planRevisionId, "PlanRevision");
  uniqueIds(s.planTemplates, x => x.planTemplateId, "PlanTemplate");
  uniqueIds(s.recurrenceRules, x => x.recurrenceRuleId, "RecurrenceRule");
  uniqueIds(s.incomeSources, x => x.incomeSourceId, "IncomeSource");
  uniqueIds(s.workOccurrences, x => x.workOccurrenceId, "WorkOccurrence");
  uniqueIds(s.moneyMovements, x => x.movementId, "MoneyMovement");
  uniqueIds(s.moneyMovementRevisions, x => x.movementRevisionId, "MoneyMovementRevision");
  uniqueIds(s.planRealizations, x => x.planRealizationId, "PlanRealization");
  uniqueIds(s.allocations, x => x.allocationId, "Allocation");
  uniqueIds(s.allocationEvents, x => x.allocationEventId, "AllocationEvent");
  uniqueIds(s.dailyEvents, x => x.dailyEventId, "DailyEvent");
  uniqueIds(s.categories, x => x.categoryId, "Category");
  uniqueIds(s.groups, x => x.groupId, "Group");
  uniqueIds(s.monthPeriods, x => x.monthId, "MonthPeriod");
  uniqueIds(s.fxRateQuotes, x => x.fxRateQuoteId, "FxRateQuote");

  const recurrenceIds = new Set(s.recurrenceRules.map(x => x.recurrenceRuleId));
  s.recurrenceRules.forEach(validateRecurrenceRule);

  const sourceIds = new Set(s.incomeSources.map(x => x.incomeSourceId));
  for (const source of s.incomeSources) {
    requiredText(source.name, "IncomeSource name");
    validateCurrencyCode(source.defaultCurrency);
    if (source.unitPrice) {
      validateNonNegativeMoney(source.unitPrice, "IncomeSource unitPrice");
      if (source.unitPrice.currencyCode !== source.defaultCurrency) {
        throw new DomainV2ValidationError("IncomeSource unitPrice currency must match defaultCurrency.");
      }
    }
  }

  const templateIds = new Set(s.planTemplates.map(x => x.planTemplateId));
  for (const template of s.planTemplates) {
    requiredText(template.name, "PlanTemplate name");
    validateNonNegativeMoney(template.defaultPlannedAmount, "PlanTemplate defaultPlannedAmount");
    if (template.recurrenceRuleId && !recurrenceIds.has(template.recurrenceRuleId)) {
      throw new DomainV2ValidationError("PlanTemplate recurrence rule must exist.");
    }
    if (template.incomeSourceId && !sourceIds.has(template.incomeSourceId)) {
      throw new DomainV2ValidationError("PlanTemplate income source must exist.");
    }
    validatePreferredDay(template.earliestAllowedDay, "PlanTemplate earliestAllowedDay");
  }

  const planItemIds = new Set(s.planItems.map(x => x.planItemId));
  for (const item of s.planItems) {
    requiredText(item.name, "PlanItem name");
    validMonth(item.monthId, "PlanItem monthId");
    validateNonNegativeMoney(item.currentPlannedAmount, "PlanItem currentPlannedAmount");
    if (item.planTemplateId && !templateIds.has(item.planTemplateId)) {
      throw new DomainV2ValidationError("PlanItem template must exist.");
    }
    if (item.recurrenceRuleId && !recurrenceIds.has(item.recurrenceRuleId)) {
      throw new DomainV2ValidationError("PlanItem recurrence rule must exist.");
    }
    if (item.incomeSourceId && !sourceIds.has(item.incomeSourceId)) {
      throw new DomainV2ValidationError("PlanItem income source must exist.");
    }
    if (item.expectedDate && !isValidIsoDate(item.expectedDate)) {
      throw new DomainV2ValidationError("PlanItem expectedDate must be a real YYYY-MM-DD date.");
    }
  }

  const plansById = new Map(s.planItems.map(item => [item.planItemId, item]));
  const revisionsByPlan = new Map<string, typeof s.planRevisions>();
  for (const revision of s.planRevisions) {
    const plan = plansById.get(revision.planItemId);
    if (!plan) {
      throw new DomainV2ValidationError("PlanRevision plan item must exist.");
    }
    positiveInteger(revision.revisionNo, "PlanRevision revisionNo");
    if (!revision.previousAmount || !revision.newAmount) {
      throw new DomainV2ValidationError("PlanRevision amount shape is unsupported.");
    }
    validateNonNegativeMoney(revision.previousAmount, "PlanRevision previousAmount");
    validateNonNegativeMoney(revision.newAmount, "PlanRevision newAmount");
    if (![revision.previousAmount.amountMinor, revision.newAmount.amountMinor].every(Number.isSafeInteger) ||
        revision.previousAmount.currencyCode !== plan.currentPlannedAmount.currencyCode ||
        revision.newAmount.currencyCode !== plan.currentPlannedAmount.currencyCode) {
      throw new DomainV2ValidationError("PlanRevision amounts must use exact native-currency Money.");
    }
    const revisions = revisionsByPlan.get(revision.planItemId) ?? [];
    if (revisions.some(value => value.revisionNo === revision.revisionNo)) {
      throw new DomainV2ValidationError("PlanRevision revisionNo must be unique per PlanItem.");
    }
    revisions.push(revision);
    revisionsByPlan.set(revision.planItemId, revisions);
  }
  for (const [planItemId, revisions] of revisionsByPlan) {
    const ordered = [...revisions].sort((a, b) => a.revisionNo - b.revisionNo);
    ordered.forEach((revision, index) => {
      if (revision.revisionNo !== index + 1 ||
          revision.previousAmount.amountMinor === revision.newAmount.amountMinor ||
          (index > 0 && revision.previousAmount.amountMinor !== ordered[index - 1].newAmount.amountMinor)) {
        throw new DomainV2ValidationError("PlanRevision history must be continuous.");
      }
    });
    if (ordered.at(-1)!.newAmount.amountMinor !== plansById.get(planItemId)!.currentPlannedAmount.amountMinor) {
      throw new DomainV2ValidationError("PlanRevision current amount must match PlanItem.");
    }
  }

  const accounts = accountById(s.accounts);
  for (const account of s.accounts) {
    requiredText(account.name, "Account name");
    validateCurrencyCode(account.currencyCode);
  }

  for (const anchor of s.accountBalanceAnchors) {
    const account = accounts.get(anchor.accountId);
    if (!account) throw new DomainV2ValidationError("AccountBalanceAnchor account must exist.");
    validateMoney(anchor.balance, "AccountBalanceAnchor balance");
    if (
      anchor.sameDayCoverage !== undefined &&
      anchor.sameDayCoverage !== "BEFORE_MOVEMENTS" &&
      anchor.sameDayCoverage !== "AFTER_MOVEMENTS"
    ) {
      throw new DomainV2ValidationError("AccountBalanceAnchor sameDayCoverage is invalid.");
    }
    if (anchor.balance.currencyCode !== account.currencyCode) {
      throw new DomainV2ValidationError("AccountBalanceAnchor currency must match account currency.");
    }
  }

  const movementIds = new Set(s.moneyMovements.map(x => x.movementId));
  const movementRevisions = new Map<string, MoneyMovementRevision[]>();
  for (const revision of s.moneyMovementRevisions) {
    if (!movementIds.has(revision.movementId)) {
      throw new DomainV2ValidationError("MoneyMovementRevision movement must exist.");
    }
    validateMovementRevision(revision, accounts);
    const revisions = movementRevisions.get(revision.movementId) ?? [];
    if (revisions.some(x => x.revisionNo === revision.revisionNo)) {
      throw new DomainV2ValidationError("MoneyMovement revisionNo must be unique per movement.");
    }
    revisions.push(revision);
    movementRevisions.set(revision.movementId, revisions);
  }

  for (const movement of s.moneyMovements) {
    positiveInteger(movement.currentRevisionNo, "MoneyMovement currentRevisionNo");
    const revisions = movementRevisions.get(movement.movementId) ?? [];
    if (revisions.length === 0) {
      throw new DomainV2ValidationError("MoneyMovement must have at least one revision.");
    }
    for (const revision of revisions) {
      if (revision.payload.movementType !== movement.movementType) {
        throw new DomainV2ValidationError("MoneyMovement revision type must match stable movement type.");
      }
    }
    const maxRevision = Math.max(...revisions.map(x => x.revisionNo));
    if (movement.currentRevisionNo !== maxRevision) {
      throw new DomainV2ValidationError("MoneyMovement currentRevisionNo must point to the latest revision.");
    }
  }

  for (const realization of s.planRealizations) {
    if (!planItemIds.has(realization.planItemId)) {
      throw new DomainV2ValidationError("PlanRealization plan item must exist.");
    }
    if (!movementIds.has(realization.movementId)) {
      throw new DomainV2ValidationError("PlanRealization movement must exist.");
    }
    const movement = s.moneyMovements.find(x => x.movementId === realization.movementId)!;
    if (movement.movementType === "TRANSFER") {
      throw new DomainV2ValidationError("TRANSFER cannot realize an income/expense PlanItem.");
    }
    validateNonNegativeMoney(realization.realizedAmount, "PlanRealization realizedAmount");
  }

  const allocationIds = new Set(s.allocations.map(x => x.allocationId));
  for (const allocation of s.allocations) {
    const account = accounts.get(allocation.accountId);
    if (!account) throw new DomainV2ValidationError("Allocation account must exist.");
    requiredText(allocation.purpose, "Allocation purpose");
    validateCurrencyCode(allocation.currencyCode);
    if (allocation.currencyCode !== account.currencyCode) {
      throw new DomainV2ValidationError("Allocation currency must match account currency.");
    }
    if (allocation.linkedPlanItemId && !planItemIds.has(allocation.linkedPlanItemId)) {
      throw new DomainV2ValidationError("Allocation linked plan item must exist.");
    }
  }

  for (const event of s.allocationEvents) {
    const allocation = s.allocations.find(x => x.allocationId === event.allocationId);
    if (!allocationIds.has(event.allocationId) || !allocation) {
      throw new DomainV2ValidationError("AllocationEvent allocation must exist.");
    }
    validateMoney(event.amount, "AllocationEvent amount");
    if (event.eventType !== "ADJUST") {
      nonNegativeInteger(event.amount.amountMinor, "AllocationEvent amountMinor");
    }
    if (event.amount.currencyCode !== allocation.currencyCode) {
      throw new DomainV2ValidationError("AllocationEvent currency must match allocation currency.");
    }
    if (event.eventType === "APPLY" && !event.movementId) {
      throw new DomainV2ValidationError("Allocation APPLY must reference a MoneyMovement.");
    }
    if (event.movementId && !movementIds.has(event.movementId)) {
      throw new DomainV2ValidationError("AllocationEvent movement must exist.");
    }
  }

  for (const event of s.dailyEvents) {
    if (!isValidIsoDate(event.date)) {
      throw new DomainV2ValidationError("DailyEvent date must be a real YYYY-MM-DD date.");
    }
    requiredText(event.title, "DailyEvent title");
    for (const movementId of event.movementIds) {
      if (!movementIds.has(movementId)) {
        throw new DomainV2ValidationError("DailyEvent movement must exist.");
      }
    }
  }

  for (const occurrence of s.workOccurrences) {
    if (!sourceIds.has(occurrence.incomeSourceId)) {
      throw new DomainV2ValidationError("WorkOccurrence income source must exist.");
    }
    if (!isValidIsoDate(occurrence.date)) {
      throw new DomainV2ValidationError("WorkOccurrence date must be a real YYYY-MM-DD date.");
    }
    if (!Number.isFinite(occurrence.quantity) || occurrence.quantity < 0) {
      throw new DomainV2ValidationError("WorkOccurrence quantity must be a non-negative finite number.");
    }
  }

  for (const month of s.monthPeriods) validMonth(month.monthId, "MonthPeriod monthId");

  for (const quote of s.fxRateQuotes) {
    validateCurrencyCode(quote.baseCurrencyCode);
    validateCurrencyCode(quote.quoteCurrencyCode);
    positiveInteger(quote.numerator, "FxRateQuote numerator");
    positiveInteger(quote.denominator, "FxRateQuote denominator");
    validMonth(quote.effectiveMonth, "FxRateQuote effectiveMonth");
  }
}
