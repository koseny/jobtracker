import { useMemo, useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import type { Money, PlanDirection } from "../../domain/v2/cashFlowV2";
import {
  filterMonthGroups,
  formatMoney,
  signedMoneyDifference,
  totalsByCurrency,
  type CompletionFilter,
  type MonthGroupModel,
  type MonthItemRowModel,
  type MonthViewModel,
} from "../presentation/presentationModel";
import { presentationText } from "../presentation/presentationText";
import "./month.css";

type FocusPanel = "INCOME" | "EXPENSE" | null;

type Props = {
  language: LanguageCode;
  model: MonthViewModel;
  initialFocusPanel?: Exclude<FocusPanel, null>;
  onPreviousMonth?: () => void;
  onNextMonth?: () => void;
  onCurrentMonth?: () => void;
  onSelectedMonthChange?: (monthId: string) => void;
  onAdd?: (direction: PlanDirection) => void;
  onOpenItem?: (rowId: string) => void;
  onOpenAccounts?: () => void;
};

function moneyFromMinor(amountMinor: number, currencyCode: Money["currencyCode"]): Money {
  return { amountMinor, currencyCode };
}

function Totals({
  groups,
  language,
}: {
  groups: MonthGroupModel[];
  language: LanguageCode;
}) {
  const totals = totalsByCurrency(groups);

  return (
    <div className="hcf-month-totals">
      {totals.map(total => (
        <span className="hcf-month-total-chip" key={total.currencyCode}>
          <span>{presentationText(language, "planned")}</span>
          <strong>
            {formatMoney(moneyFromMinor(total.plannedMinor, total.currencyCode), language)}
          </strong>
          <span>{presentationText(language, "actual")}</span>
          <strong>
            {formatMoney(moneyFromMinor(total.actualMinor, total.currencyCode), language)}
          </strong>
        </span>
      ))}
    </div>
  );
}

function GroupSubtotal({
  group,
  language,
}: {
  group: MonthGroupModel;
  language: LanguageCode;
}) {
  const totals = totalsByCurrency([group]);
  return (
    <span className="hcf-group-subtotal">
      {totals.map(total => (
        <span key={total.currencyCode}>
          {formatMoney(moneyFromMinor(total.plannedMinor, total.currencyCode), language)}
          {" / "}
          {formatMoney(moneyFromMinor(total.actualMinor, total.currencyCode), language)}
        </span>
      ))}
    </span>
  );
}

function MonthRow({
  row,
  language,
  onOpenItem,
}: {
  row: MonthItemRowModel;
  language: LanguageCode;
  onOpenItem?: (rowId: string) => void;
}) {
  const difference = signedMoneyDifference(row.actual, row.planned);
  const differenceLabel = difference
    ? formatMoney(difference, language)
    : "—";

  return (
    <div className="hcf-month-row">
      <div className="hcf-month-row__name">
        <strong>{row.name}</strong>
        {row.helpText && (
          <span className="hcf-inline-help" tabIndex={0}>
            i
            <span role="tooltip">{row.helpText}</span>
          </span>
        )}
      </div>
      <span>{formatMoney(row.planned, language)}</span>
      <span>{row.actual ? formatMoney(row.actual, language) : "—"}</span>
      <span>{differenceLabel}</span>
      <span>{presentationText(language, row.completionStatus === "OPEN" ? "open" : "completed")}</span>
      <button
        type="button"
        className="hcf-row-action"
        aria-label={`${row.name} — ${presentationText(language, "information")}`}
        onClick={() => onOpenItem?.(row.id)}
      >
        ⋯
      </button>
    </div>
  );
}

function CashFlowPanel({
  direction,
  groups,
  language,
  focused,
  collapsed,
  query,
  completionFilter,
  grouped,
  onToggleGroup,
  onFocus,
  onExitFocus,
  onAdd,
  onOpenItem,
  onQueryChange,
  onCompletionFilterChange,
  onGroupedChange,
  onCollapseAll,
  onExpandAll,
}: {
  direction: Exclude<FocusPanel, null>;
  groups: MonthGroupModel[];
  language: LanguageCode;
  focused: boolean;
  collapsed: Set<string>;
  query: string;
  completionFilter: CompletionFilter;
  grouped: boolean;
  onToggleGroup: (groupId: string) => void;
  onFocus: () => void;
  onExitFocus: () => void;
  onAdd?: () => void;
  onOpenItem?: (rowId: string) => void;
  onQueryChange: (query: string) => void;
  onCompletionFilterChange: (filter: CompletionFilter) => void;
  onGroupedChange: (grouped: boolean) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}) {
  const visibleGroups = useMemo(
    () => focused ? filterMonthGroups(groups, query, completionFilter) : groups,
    [completionFilter, focused, groups, query],
  );
  const title = presentationText(language, direction === "INCOME" ? "income" : "spending");

  const renderedGroups = grouped
    ? visibleGroups
    : [{
        id: "__ungrouped__",
        name: "",
        rows: visibleGroups.flatMap(group => group.rows),
      }];

  return (
    <article
      className={[
        "hcf-month-panel",
        direction === "INCOME" ? "hcf-month-panel--income" : "hcf-month-panel--spending",
        focused ? "hcf-month-panel--focused" : "",
      ].filter(Boolean).join(" ")}
    >
      <header className="hcf-month-panel__header">
        <div>
          <strong>{title}</strong>
          <Totals groups={groups} language={language} />
        </div>
        <div className="hcf-month-panel__actions">
          {focused ? (
            <button type="button" className="hcf-secondary-action" onClick={onExitFocus}>
              ← {presentationText(language, "backToMonth")}
            </button>
          ) : (
            <button type="button" className="hcf-icon-action" onClick={onFocus}>
              ⤢ <span>{presentationText(language, "focus")}</span>
            </button>
          )}
          <button type="button" className="hcf-primary-action" onClick={onAdd}>
            + {presentationText(language, "add")}
          </button>
        </div>
      </header>

      {focused && (
        <div className="hcf-focus-toolbar">
          <label className="hcf-search-field">
            <span>{presentationText(language, "search")}</span>
            <input
              type="search"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
            />
          </label>
          <label>
            <span>{presentationText(language, "filter")}</span>
            <select
              value={completionFilter}
              onChange={event => onCompletionFilterChange(event.target.value as CompletionFilter)}
            >
              <option value="ALL">{presentationText(language, "all")}</option>
              <option value="OPEN">{presentationText(language, "open")}</option>
              <option value="COMPLETED">{presentationText(language, "completed")}</option>
            </select>
          </label>
          <button
            type="button"
            className={grouped ? "hcf-toolbar-button is-active" : "hcf-toolbar-button"}
            aria-pressed={grouped}
            onClick={() => onGroupedChange(!grouped)}
          >
            {presentationText(language, "group")}
          </button>
          <button type="button" className="hcf-toolbar-button" onClick={onCollapseAll}>
            {presentationText(language, "collapseAll")}
          </button>
          <button type="button" className="hcf-toolbar-button" onClick={onExpandAll}>
            {presentationText(language, "expandAll")}
          </button>
        </div>
      )}

      <div className="hcf-month-table" role="table" aria-label={title}>
        <div className="hcf-month-row hcf-month-row--head" role="row">
          <span>{title}</span>
          <span>{presentationText(language, "planned")}</span>
          <span>{presentationText(language, "actual")}</span>
          <span>{presentationText(language, "difference")}</span>
          <span>{presentationText(language, "status")}</span>
          <span aria-hidden="true">·</span>
        </div>

        {renderedGroups.length === 0 && (
          <p className="hcf-month-empty">{presentationText(language, "noItems")}</p>
        )}

        {renderedGroups.map(group => {
          const isCollapsed = grouped && collapsed.has(group.id);
          return (
            <section className="hcf-month-group" key={group.id}>
              {grouped && (
                <button
                  type="button"
                  className="hcf-month-group__header"
                  aria-expanded={!isCollapsed}
                  onClick={() => onToggleGroup(group.id)}
                >
                  <span>{isCollapsed ? "▸" : "▾"} {group.name}</span>
                  <GroupSubtotal group={group} language={language} />
                </button>
              )}
              {!isCollapsed && group.rows.map(row => (
                <MonthRow
                  key={row.id}
                  row={row}
                  language={language}
                  onOpenItem={onOpenItem}
                />
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}

function PositionPanel({
  model,
  language,
  onOpenAccounts,
}: {
  model: MonthViewModel;
  language: LanguageCode;
  onOpenAccounts?: () => void;
}) {
  return (
    <aside className="hcf-month-position">
      <header className="hcf-month-position__header">
        <strong>{presentationText(language, "position")}</strong>
        {onOpenAccounts && (
          <button type="button" className="hcf-text-action" onClick={onOpenAccounts}>
            {presentationText(language, "accounts")}
          </button>
        )}
      </header>

      <div className="hcf-month-position__list">
        {model.accounts.map(account => (
          <article className="hcf-account-summary" key={account.accountId}>
            <strong>{account.name}</strong>
            <span>{formatMoney(account.position, language)}</span>
            <small>
              {presentationText(language, "allocated")}: {formatMoney(account.allocated, language)}
            </small>
            <small>
              {presentationText(language, "free")}: {formatMoney(account.free, language)}
            </small>
          </article>
        ))}
      </div>

      {model.reportingEquivalent && (
        <div className="hcf-month-reporting">
          <span>{presentationText(language, "reportingEquivalent")}</span>
          <strong>
            {model.reportingEquivalent.value
              ? formatMoney(model.reportingEquivalent.value, language)
              : "—"}
          </strong>
          {model.reportingEquivalent.fxContext && <small>{model.reportingEquivalent.fxContext}</small>}
          {model.reportingEquivalent.incomplete && (
            <small>{presentationText(language, "fxUnavailable")}</small>
          )}
        </div>
      )}
    </aside>
  );
}

export function MonthScreen({
  language,
  model,
  initialFocusPanel,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectedMonthChange,
  onAdd,
  onOpenItem,
  onOpenAccounts,
}: Props) {
  const [focusPanel, setFocusPanel] = useState<FocusPanel>(initialFocusPanel ?? null);
  const [incomeCollapsed, setIncomeCollapsed] = useState<Set<string>>(new Set());
  const [spendingCollapsed, setSpendingCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("ALL");
  const [grouped, setGrouped] = useState(true);

  function toggleCollapsed(
    setState: (value: Set<string>) => void,
    current: Set<string>,
    groupId: string,
  ) {
    const next = new Set(current);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setState(next);
  }

  function resetFocusTools() {
    setQuery("");
    setCompletionFilter("ALL");
    setGrouped(true);
  }

  function enterFocus(direction: Exclude<FocusPanel, null>) {
    resetFocusTools();
    setFocusPanel(direction);
  }

  function exitFocus() {
    resetFocusTools();
    setFocusPanel(null);
  }

  const commonPanelProps = {
    language,
    query,
    completionFilter,
    grouped,
    onExitFocus: exitFocus,
    onQueryChange: setQuery,
    onCompletionFilterChange: setCompletionFilter,
    onGroupedChange: setGrouped,
    onOpenItem,
  };

  return (
    <section className={focusPanel ? "hcf-month-screen hcf-month-screen--focus" : "hcf-month-screen"}>
      <header className="hcf-month-header">
        <button
          type="button"
          className="hcf-month-nav-button"
          aria-label={presentationText(language, "previousMonth")}
          onClick={onPreviousMonth}
        >
          ‹
        </button>
        <label className="hcf-month-picker">
          <span className="sr-only">{presentationText(language, "month")}</span>
          <input
            type="month"
            value={model.selectedMonth}
            onChange={event => onSelectedMonthChange?.(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="hcf-month-nav-button"
          aria-label={presentationText(language, "nextMonth")}
          onClick={onNextMonth}
        >
          ›
        </button>
        <button type="button" className="hcf-current-month-button" onClick={onCurrentMonth}>
          {presentationText(language, "currentMonth")}
        </button>
      </header>

      <div className="hcf-month-workspace">
        {(focusPanel === null || focusPanel === "INCOME") && (
          <CashFlowPanel
            {...commonPanelProps}
            direction="INCOME"
            groups={model.incomeGroups}
            focused={focusPanel === "INCOME"}
            collapsed={incomeCollapsed}
            onToggleGroup={groupId =>
              toggleCollapsed(setIncomeCollapsed, incomeCollapsed, groupId)
            }
            onFocus={() => enterFocus("INCOME")}
            onAdd={() => onAdd?.("INCOME")}
            onCollapseAll={() =>
              setIncomeCollapsed(new Set(model.incomeGroups.map(group => group.id)))
            }
            onExpandAll={() => setIncomeCollapsed(new Set())}
          />
        )}

        {(focusPanel === null || focusPanel === "EXPENSE") && (
          <CashFlowPanel
            {...commonPanelProps}
            direction="EXPENSE"
            groups={model.spendingGroups}
            focused={focusPanel === "EXPENSE"}
            collapsed={spendingCollapsed}
            onToggleGroup={groupId =>
              toggleCollapsed(setSpendingCollapsed, spendingCollapsed, groupId)
            }
            onFocus={() => enterFocus("EXPENSE")}
            onAdd={() => onAdd?.("EXPENSE")}
            onCollapseAll={() =>
              setSpendingCollapsed(new Set(model.spendingGroups.map(group => group.id)))
            }
            onExpandAll={() => setSpendingCollapsed(new Set())}
          />
        )}

        {focusPanel === null && (
          <PositionPanel
            model={model}
            language={language}
            onOpenAccounts={onOpenAccounts}
          />
        )}
      </div>
    </section>
  );
}
