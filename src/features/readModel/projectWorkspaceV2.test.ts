import { describe, expect, it } from "vitest";
import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import { projectWorkspaceV2ToOperationalViewModels } from "./projectWorkspaceV2";

function workspace(): CashFlowWorkspaceV2 {
  const created = "2026-08-01T00:00:00Z";
  return {
    workspaceId: "home",
    ownerPartitionId: "owner-v2",
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision: 1,
    createdAt: created,
    updatedAt: "2026-09-30T20:00:00Z",
    sourceState: {
      accounts: [
        {
          accountId: "main",
          name: "Main bank",
          accountType: "BANK",
          currencyCode: "HUF",
          active: true,
          createdAt: created,
          updatedAt: created,
        },
        {
          accountId: "eur",
          name: "EUR savings",
          accountType: "SAVINGS",
          currencyCode: "EUR",
          active: true,
          createdAt: created,
          updatedAt: created,
        },
      ],
      accountBalanceAnchors: [
        {
          accountBalanceAnchorId: "anchor-main",
          accountId: "main",
          anchorType: "INITIAL",
          balance: { amountMinor: 300_000, currencyCode: "HUF" },
          effectiveAt: "2026-08-31T23:00:00Z",
        },
        {
          accountBalanceAnchorId: "anchor-eur",
          accountId: "eur",
          anchorType: "INITIAL",
          balance: { amountMinor: 10_000, currencyCode: "EUR" },
          effectiveAt: "2026-08-31T23:00:00Z",
        },
      ],
      planItems: [
        {
          planItemId: "plan-salary",
          monthId: "2026-09",
          direction: "INCOME",
          name: "Salary",
          currentPlannedAmount: { amountMinor: 500_000, currencyCode: "HUF" },
          planStatus: "ACTIVE",
          completionStatus: "COMPLETED",
          planTemplateId: "template-salary",
          recurrenceRuleId: "rule-monthly",
          categoryId: "cat-income",
          groupId: "group-regular",
          expectedDate: "2026-09-05",
          createdAt: created,
          updatedAt: created,
        },
        {
          planItemId: "plan-groceries",
          monthId: "2026-09",
          direction: "EXPENSE",
          name: "Groceries",
          currentPlannedAmount: { amountMinor: 100_000, currencyCode: "HUF" },
          planStatus: "ACTIVE",
          completionStatus: "OPEN",
          planTemplateId: "template-groceries",
          categoryId: "cat-household",
          groupId: "group-household",
          expectedDate: "2026-09-14",
          createdAt: created,
          updatedAt: created,
        },
      ],
      planRevisions: [],
      planTemplates: [
        {
          planTemplateId: "template-salary",
          name: "Salary",
          direction: "INCOME",
          defaultPlannedAmount: { amountMinor: 500_000, currencyCode: "HUF" },
          recurrenceRuleId: "rule-monthly",
          categoryId: "cat-income",
          groupId: "group-regular",
          active: true,
          createdAt: created,
          updatedAt: created,
        },
        {
          planTemplateId: "template-groceries",
          name: "Groceries",
          direction: "EXPENSE",
          defaultPlannedAmount: { amountMinor: 100_000, currencyCode: "HUF" },
          categoryId: "cat-household",
          groupId: "group-household",
          active: true,
          createdAt: created,
          updatedAt: created,
        },
      ],
      recurrenceRules: [
        {
          recurrenceRuleId: "rule-monthly",
          kind: "MONTHLY",
          preferredDay: 5,
        },
      ],
      incomeSources: [
        {
          incomeSourceId: "client",
          name: "Client work",
          sourceType: "WORK_CLIENT",
          unit: "hour",
          unitPrice: { amountMinor: 12_000, currencyCode: "HUF" },
          defaultCurrency: "HUF",
          active: true,
        },
      ],
      workOccurrences: [
        {
          workOccurrenceId: "work-1",
          incomeSourceId: "client",
          date: "2026-09-20",
          quantity: 4,
          state: "COMPLETED",
          note: "Delivered",
        },
      ],
      moneyMovements: [
        {
          movementId: "salary",
          movementType: "INCOME",
          lifecycleStatus: "ACTIVE",
          currentRevisionNo: 2,
          createdAt: "2026-09-05T08:00:00Z",
          updatedAt: "2026-09-05T09:00:00Z",
        },
        {
          movementId: "groceries",
          movementType: "EXPENSE",
          lifecycleStatus: "ACTIVE",
          currentRevisionNo: 1,
          createdAt: "2026-09-14T14:00:00Z",
          updatedAt: "2026-09-14T14:00:00Z",
        },
        {
          movementId: "transfer",
          movementType: "TRANSFER",
          lifecycleStatus: "ACTIVE",
          currentRevisionNo: 1,
          createdAt: "2026-09-20T09:00:00Z",
          updatedAt: "2026-09-20T09:00:00Z",
        },
        {
          movementId: "eur-expense",
          movementType: "EXPENSE",
          lifecycleStatus: "ACTIVE",
          currentRevisionNo: 1,
          createdAt: "2026-09-25T09:00:00Z",
          updatedAt: "2026-09-25T09:00:00Z",
        },
        {
          movementId: "voided-expense",
          movementType: "EXPENSE",
          lifecycleStatus: "VOIDED",
          currentRevisionNo: 2,
          createdAt: "2026-09-18T09:00:00Z",
          updatedAt: "2026-09-18T10:00:00Z",
        },
      ],
      moneyMovementRevisions: [
        {
          movementRevisionId: "salary-r1",
          movementId: "salary",
          revisionNo: 1,
          payload: {
            movementType: "INCOME",
            occurredOn: "2026-09-05",
            amount: { amountMinor: 500_000, currencyCode: "HUF" },
            accountId: "main",
            categoryId: "cat-income",
            description: "Salary",
          },
          changedAt: "2026-09-05T08:00:00Z",
        },
        {
          movementRevisionId: "salary-r2",
          movementId: "salary",
          revisionNo: 2,
          payload: {
            movementType: "INCOME",
            occurredOn: "2026-09-05",
            amount: { amountMinor: 505_000, currencyCode: "HUF" },
            accountId: "main",
            categoryId: "cat-income",
            description: "Salary corrected",
          },
          changedAt: "2026-09-05T09:00:00Z",
        },
        {
          movementRevisionId: "groceries-r1",
          movementId: "groceries",
          revisionNo: 1,
          payload: {
            movementType: "EXPENSE",
            occurredOn: "2026-09-14",
            amount: { amountMinor: 34_500, currencyCode: "HUF" },
            accountId: "main",
            categoryId: "cat-household",
            description: "Groceries",
          },
          changedAt: "2026-09-14T14:00:00Z",
        },
        {
          movementRevisionId: "transfer-r1",
          movementId: "transfer",
          revisionNo: 1,
          payload: {
            movementType: "TRANSFER",
            occurredOn: "2026-09-20",
            sourceAccountId: "main",
            destinationAccountId: "eur",
            sourceAmount: { amountMinor: 40_000, currencyCode: "HUF" },
            destinationAmount: { amountMinor: 10_000, currencyCode: "EUR" },
            description: "Transfer to EUR savings",
          },
          changedAt: "2026-09-20T09:00:00Z",
        },
        {
          movementRevisionId: "eur-expense-r1",
          movementId: "eur-expense",
          revisionNo: 1,
          payload: {
            movementType: "EXPENSE",
            occurredOn: "2026-09-25",
            amount: { amountMinor: 5_000, currencyCode: "EUR" },
            accountId: "eur",
            categoryId: "cat-household",
            description: "EUR expense",
          },
          changedAt: "2026-09-25T09:00:00Z",
        },
        {
          movementRevisionId: "void-r1",
          movementId: "voided-expense",
          revisionNo: 1,
          payload: {
            movementType: "EXPENSE",
            occurredOn: "2026-09-18",
            amount: { amountMinor: 10_000, currencyCode: "HUF" },
            accountId: "main",
            categoryId: "cat-household",
            description: "Voided draft",
          },
          changedAt: "2026-09-18T09:00:00Z",
        },
        {
          movementRevisionId: "void-r2",
          movementId: "voided-expense",
          revisionNo: 2,
          payload: {
            movementType: "EXPENSE",
            occurredOn: "2026-09-18",
            amount: { amountMinor: 20_000, currencyCode: "HUF" },
            accountId: "main",
            categoryId: "cat-household",
            description: "Voided corrected",
          },
          changedAt: "2026-09-18T10:00:00Z",
        },
      ],
      planRealizations: [
        {
          planRealizationId: "real-salary",
          planItemId: "plan-salary",
          movementId: "salary",
          realizedAmount: { amountMinor: 505_000, currencyCode: "HUF" },
          createdAt: "2026-09-05T09:00:00Z",
        },
        {
          planRealizationId: "real-groceries",
          planItemId: "plan-groceries",
          movementId: "groceries",
          realizedAmount: { amountMinor: 34_500, currencyCode: "HUF" },
          createdAt: "2026-09-14T14:00:00Z",
        },
      ],
      allocations: [
        {
          allocationId: "insurance",
          accountId: "main",
          purpose: "Insurance",
          currencyCode: "HUF",
          state: "ACTIVE",
          linkedPlanItemId: "plan-groceries",
          createdAt: created,
          updatedAt: created,
        },
        {
          allocationId: "travel",
          accountId: "eur",
          purpose: "Travel",
          currencyCode: "EUR",
          state: "ACTIVE",
          createdAt: created,
          updatedAt: created,
        },
      ],
      allocationEvents: [
        {
          allocationEventId: "insurance-reserve",
          allocationId: "insurance",
          eventType: "RESERVE",
          amount: { amountMinor: 120_000, currencyCode: "HUF" },
          occurredAt: "2026-09-01T08:00:00Z",
        },
        {
          allocationEventId: "insurance-apply",
          allocationId: "insurance",
          eventType: "APPLY",
          amount: { amountMinor: 20_000, currencyCode: "HUF" },
          occurredAt: "2026-09-14T14:05:00Z",
          movementId: "groceries",
        },
        {
          allocationEventId: "travel-reserve",
          allocationId: "travel",
          eventType: "RESERVE",
          amount: { amountMinor: 2_500, currencyCode: "EUR" },
          occurredAt: "2026-09-02T08:00:00Z",
        },
      ],
      dailyEvents: [
        {
          dailyEventId: "shopping",
          date: "2026-09-14",
          title: "Shopping",
          note: "Bring reusable bags",
          movementIds: ["groceries"],
          createdAt: created,
          updatedAt: created,
        },
      ],
      categories: [
        { categoryId: "cat-income", name: "Income", sortOrder: 1, active: true },
        { categoryId: "cat-household", name: "Household", sortOrder: 2, active: true },
      ],
      groups: [
        { groupId: "group-regular", name: "Regular income", sortOrder: 1, active: true },
        { groupId: "group-household", name: "Household", sortOrder: 2, active: true },
      ],
      monthPeriods: [],
      fxRateQuotes: [
        {
          fxRateQuoteId: "eur-huf-sep",
          baseCurrencyCode: "EUR",
          quoteCurrencyCode: "HUF",
          numerator: 400,
          denominator: 100,
          effectiveMonth: "2026-09",
          sourceLabel: "Test EUR/HUF",
        },
      ],
    },
  };
}

describe("canonical v2 read-model projection", () => {
  it("uses current ACTIVE movement revisions for flow and account position", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");

    expect(model.overview.kpis.find(x => x.id === "income")?.value)
      .toEqual({ amountMinor: 505_000, currencyCode: "HUF" });
    expect(model.overview.kpis.find(x => x.id === "spending")?.value)
      .toEqual({ amountMinor: 54_500, currencyCode: "HUF" });
    expect(model.overview.kpis.find(x => x.id === "monthlyResult")?.value)
      .toEqual({ amountMinor: 450_500, currencyCode: "HUF" });

    const main = model.accounts.accounts.find(x => x.accountId === "main");
    const eur = model.accounts.accounts.find(x => x.accountId === "eur");
    expect(main?.position).toEqual({ amountMinor: 730_500, currencyCode: "HUF" });
    expect(eur?.position).toEqual({ amountMinor: 15_000, currencyCode: "EUR" });
  });

  it("derives allocations and free availability without changing account position", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const insurance = model.accounts.allocations.find(x => x.allocationId === "insurance");
    const main = model.accounts.accounts.find(x => x.accountId === "main");

    expect(insurance).toMatchObject({
      reserved: { amountMinor: 120_000, currencyCode: "HUF" },
      applied: { amountMinor: 20_000, currencyCode: "HUF" },
      remaining: { amountMinor: 100_000, currencyCode: "HUF" },
    });
    expect(main?.allocated).toEqual({ amountMinor: 100_000, currencyCode: "HUF" });
    expect(main?.free).toEqual({ amountMinor: 630_500, currencyCode: "HUF" });
  });

  it("projects plan actuals from PlanRealization and keeps over-realization visible", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const salary = model.month.incomeGroups.flatMap(x => x.rows).find(x => x.id === "plan-salary");
    const groceries = model.month.spendingGroups.flatMap(x => x.rows).find(x => x.id === "plan-groceries");

    expect(salary?.planned.amountMinor).toBe(500_000);
    expect(salary?.actual?.amountMinor).toBe(505_000);
    expect(groceries?.actual?.amountMinor).toBe(34_500);
  });

  it("preserves both sides of a cross-currency transfer while excluding it from BE/KI", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const transfer = model.transactionRows.find(x => x.movementId === "transfer");

    expect(transfer?.amount).toEqual({ amountMinor: 40_000, currencyCode: "HUF" });
    expect(transfer?.counterAmount).toEqual({ amountMinor: 10_000, currencyCode: "EUR" });
    expect(model.overview.kpis.find(x => x.id === "income")?.value?.amountMinor).toBe(505_000);
    expect(model.overview.kpis.find(x => x.id === "spending")?.value?.amountMinor).toBe(54_500);
  });

  it("consolidates position with explicit exact-ratio FX and marks missing FX incomplete", () => {
    const source = workspace();
    const complete = projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN");
    expect(complete.accounts.reportingEquivalent?.value)
      .toEqual({ amountMinor: 790_500, currencyCode: "HUF" });

    source.sourceState.fxRateQuotes = [];
    const incomplete = projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN");
    expect(incomplete.accounts.reportingEquivalent?.value).toBeNull();
    expect(incomplete.accounts.reportingEquivalent?.incomplete).toBe(true);
    expect(incomplete.overview.comparison.incomplete).toBe(true);
  });

  it("keeps VOIDED movements in ledger history but excludes them from active calculations/calendar actuals", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const voided = model.transactionRows.find(x => x.movementId === "voided-expense");
    expect(voided).toMatchObject({
      lifecycleStatus: "VOIDED",
      amount: { amountMinor: 20_000, currencyCode: "HUF" },
    });

    const calendarIds = model.calendar.days.flatMap(day => day.entries.map(entry => entry.id));
    expect(calendarIds).not.toContain("voided-expense");
  });

  it("projects DailyEvent, plan, work and active actual entries into the same calendar month surface", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const day14 = model.calendar.days.find(day => day.date === "2026-09-14")!;
    const day20 = model.calendar.days.find(day => day.date === "2026-09-20")!;

    expect(day14.entries.map(x => x.kind)).toEqual(
      expect.arrayContaining(["EVENT", "NOTE", "PLANNED", "ACTUAL_EXPENSE"]),
    );
    expect(day20.entries.map(x => x.kind)).toEqual(
      expect.arrayContaining(["WORK", "TRANSFER"]),
    );
  });

  it("represents optional template recurrence as no recurrence rather than inventing a rule", () => {
    const model = projectWorkspaceV2ToOperationalViewModels(workspace(), "2026-09", "EN");
    const groceries = model.planning.templates.find(x => x.planTemplateId === "template-groceries");
    expect(groceries?.recurrence).toBe("NONE");
  });

  it("refuses to invent same-day ordering between a balance anchor and date-only movement", () => {
    const source = workspace();
    source.sourceState.accountBalanceAnchors[0].effectiveAt = "2026-09-05T00:00:00Z";

    expect(() => projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN"))
      .toThrow("same calendar date");
  });

  it("uses explicit opening or closing coverage for the anchor date without changing flows", () => {
    const source = workspace();
    const anchor = source.sourceState.accountBalanceAnchors[0];
    anchor.effectiveAt = "2026-09-05T12:00:00Z";

    anchor.sameDayCoverage = "BEFORE_MOVEMENTS";
    const opening = projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN");
    expect(opening.accounts.accounts.find(x => x.accountId === "main")?.position.amountMinor).toBe(730_500);

    anchor.sameDayCoverage = "AFTER_MOVEMENTS";
    const closing = projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN");
    expect(closing.accounts.accounts.find(x => x.accountId === "main")?.position.amountMinor).toBe(225_500);
    expect(closing.overview.kpis.slice(0, 3)).toEqual(opening.overview.kpis.slice(0, 3));
  });

  it("applies transfer-date coverage independently to each account", () => {
    const source = workspace();
    const [main, eur] = source.sourceState.accountBalanceAnchors;
    main.effectiveAt = "2026-09-20T08:00:00Z";
    main.balance.amountMinor = 100_000;
    main.sameDayCoverage = "BEFORE_MOVEMENTS";
    eur.effectiveAt = "2026-09-20T18:00:00Z";
    eur.balance.amountMinor = 20_000;
    eur.sameDayCoverage = "AFTER_MOVEMENTS";

    const model = projectWorkspaceV2ToOperationalViewModels(source, "2026-09", "EN");
    expect(model.accounts.accounts.find(x => x.accountId === "main")?.position.amountMinor).toBe(60_000);
    expect(model.accounts.accounts.find(x => x.accountId === "eur")?.position.amountMinor).toBe(15_000);
  });
});
