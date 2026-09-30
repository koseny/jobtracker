import { useMemo, useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import { formatMoney } from "../presentation/presentationModel";
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  type TransactionDetailModel,
  type TransactionFilters,
  type TransactionLedgerRowModel,
  type TransactionType,
  type TransactionLifecycleStatus,
} from "../calendarTransactions/calendarTransactionModel";
import { calendarTransactionText as t } from "../calendarTransactions/calendarTransactionText";
import "./transactions.css";

type Props = {
  language: LanguageCode;
  selectedMonth: string;
  rows: TransactionLedgerRowModel[];
  detailsByMovementId?: Record<string, TransactionDetailModel>;
  initialMovementId?: string;
  onSelectedMonthChange?: (monthId: string) => void;
  onCorrect?: (movementId: string) => void;
  onVoid?: (movementId: string) => void;
  onDuplicate?: (movementId: string) => void;
};

function TransactionDetailPanel({
  language,
  detail,
  onClose,
  onCorrect,
  onVoid,
  onDuplicate,
}: {
  language: LanguageCode;
  detail: TransactionDetailModel;
  onClose: () => void;
  onCorrect?: (movementId: string) => void;
  onVoid?: (movementId: string) => void;
  onDuplicate?: (movementId: string) => void;
}) {
  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <aside className="hcf-transaction-detail" aria-label={t(language, "detail")}>
      <header className="hcf-transaction-detail__header">
        <div>
          <span>{t(language, "detail")}</span>
          <strong>{detail.description}</strong>
        </div>
        <button type="button" aria-label={t(language, "close")} onClick={onClose}>×</button>
      </header>

      <dl className="hcf-transaction-detail__facts">
        <div><dt>{t(language, "movementId")}</dt><dd>{detail.movementId}</dd></div>
        <div><dt>{t(language, "revision")}</dt><dd>{detail.currentRevisionNo}</dd></div>
        <div><dt>{t(language, "date")}</dt><dd>{detail.occurredOn}</dd></div>
        <div><dt>{t(language, "type")}</dt><dd>{detail.movementType}</dd></div>
        <div><dt>{t(language, "status")}</dt><dd>{detail.lifecycleStatus}</dd></div>
        <div><dt>{t(language, "account")}</dt><dd>{detail.accountLabel}{detail.counterAccountLabel ? ` → ${detail.counterAccountLabel}` : ""}</dd></div>
        <div><dt>{t(language, "category")}</dt><dd>{detail.categoryLabel || "—"}</dd></div>
        <div><dt>{t(language, "amount")}</dt><dd>{formatMoney(detail.amount, language)}</dd></div>
        <div><dt>{t(language, "planMatch")}</dt><dd>{detail.planMatchLabel || "—"}</dd></div>
        <div><dt>{t(language, "dailyEvent")}</dt><dd>{detail.linkedDailyEventLabel || "—"}</dd></div>
        <div><dt>{t(language, "allocation")}</dt><dd>{detail.allocationRelationLabel || "—"}</dd></div>
      </dl>

      {detail.dependencyWarning && (
        <div className="hcf-transaction-dependency" role="status">
          <strong>{t(language, "dependencyWarning")}</strong>
          <span>{detail.dependencyWarning}</span>
        </div>
      )}

      <div className="hcf-transaction-detail__actions">
        <button type="button" onClick={() => onCorrect?.(detail.movementId)}>
          {t(language, "correct")}
        </button>
        <button
          type="button"
          className="hcf-danger-action"
          onClick={() => onVoid?.(detail.movementId)}
        >
          {t(language, "void")}
        </button>
        <button type="button" onClick={() => onDuplicate?.(detail.movementId)}>
          {t(language, "duplicate")}
        </button>
      </div>

      <section className="hcf-audit-section">
        <button
          type="button"
          className="hcf-audit-toggle"
          aria-expanded={auditOpen}
          onClick={() => setAuditOpen(open => !open)}
        >
          {t(language, "auditHistory")} {auditOpen ? "▾" : "▸"}
        </button>
        {auditOpen && (
          <ol className="hcf-audit-list">
            {detail.auditHistory.map(entry => (
              <li key={entry.revisionNo}>
                <strong>#{entry.revisionNo}</strong>
                <time dateTime={entry.changedAt}>{entry.changedAt}</time>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="hcf-r1-note">{t(language, "noRestore")}</p>
    </aside>
  );
}

export function TransactionsScreen({
  language,
  selectedMonth,
  rows,
  detailsByMovementId = {},
  initialMovementId,
  onSelectedMonthChange,
  onCorrect,
  onVoid,
  onDuplicate,
}: Props) {
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(
    initialMovementId ?? null,
  );

  const monthRows = useMemo(
    () => rows.filter(row => row.occurredOn.startsWith(selectedMonth)),
    [rows, selectedMonth],
  );
  const visibleRows = useMemo(
    () => filterTransactions(monthRows, filters),
    [filters, monthRows],
  );
  const detail = selectedMovementId ? detailsByMovementId[selectedMovementId] ?? null : null;

  function patchFilters(patch: Partial<TransactionFilters>) {
    setFilters(current => ({ ...current, ...patch }));
  }

  return (
    <section className={detail ? "hcf-transactions-screen hcf-transactions-screen--detail-open" : "hcf-transactions-screen"}>
      <header className="hcf-transactions-toolbar">
        <div className="hcf-transactions-toolbar__month">
          <strong>{t(language, "transactions")}</strong>
          <input
            type="month"
            value={selectedMonth}
            aria-label={t(language, "currentMonth")}
            onChange={event => onSelectedMonthChange?.(event.target.value)}
          />
        </div>

        <div className="hcf-transaction-filters">
          <label className="hcf-transaction-search">
            <span>{t(language, "search")}</span>
            <input
              type="search"
              value={filters.query}
              onChange={event => patchFilters({ query: event.target.value })}
            />
          </label>

          <label>
            <span>{t(language, "type")}</span>
            <select
              value={filters.movementType}
              onChange={event => patchFilters({ movementType: event.target.value as "ALL" | TransactionType })}
            >
              <option value="ALL">{t(language, "all")}</option>
              <option value="INCOME">{t(language, "income")}</option>
              <option value="EXPENSE">{t(language, "expense")}</option>
              <option value="TRANSFER">{t(language, "transfer")}</option>
            </select>
          </label>

          <label>
            <span>{t(language, "status")}</span>
            <select
              value={filters.lifecycleStatus}
              onChange={event => patchFilters({ lifecycleStatus: event.target.value as "ALL" | TransactionLifecycleStatus })}
            >
              <option value="ALL">{t(language, "all")}</option>
              <option value="ACTIVE">{t(language, "active")}</option>
              <option value="VOIDED">{t(language, "voided")}</option>
            </select>
          </label>

          <label>
            <span>{t(language, "account")}</span>
            <input
              type="search"
              value={filters.accountLabel}
              onChange={event => patchFilters({ accountLabel: event.target.value })}
            />
          </label>

          <label>
            <span>{t(language, "category")}</span>
            <input
              type="search"
              value={filters.categoryLabel}
              onChange={event => patchFilters({ categoryLabel: event.target.value })}
            />
          </label>
        </div>
      </header>

      <div className="hcf-transactions-layout">
        <div className="hcf-ledger" role="table" aria-label={t(language, "transactions")}>
          <div className="hcf-ledger-row hcf-ledger-row--head" role="row">
            <span>{t(language, "date")}</span>
            <span>{t(language, "description")}</span>
            <span>{t(language, "type")}</span>
            <span>{t(language, "account")}</span>
            <span>{t(language, "category")}</span>
            <span>{t(language, "amount")}</span>
            <span>{t(language, "matchStatus")}</span>
          </div>

          {visibleRows.length === 0 && (
            <p className="hcf-ledger-empty">{t(language, "noTransactions")}</p>
          )}

          {visibleRows.map(row => (
            <button
              key={row.movementId}
              type="button"
              className={row.movementId === selectedMovementId ? "hcf-ledger-row hcf-ledger-row--selected" : "hcf-ledger-row"}
              onClick={() => setSelectedMovementId(row.movementId)}
            >
              <span>{row.occurredOn}</span>
              <strong>{row.description}</strong>
              <span>{row.movementType}</span>
              <span>{row.accountLabel}{row.counterAccountLabel ? ` → ${row.counterAccountLabel}` : ""}</span>
              <span>{row.categoryLabel || "—"}</span>
              <strong>{formatMoney(row.amount, language)}</strong>
              <span>{row.reconciliationStatus || row.lifecycleStatus}</span>
            </button>
          ))}
        </div>

        {detail && (
          <TransactionDetailPanel
            language={language}
            detail={detail}
            onClose={() => setSelectedMovementId(null)}
            onCorrect={onCorrect}
            onVoid={onVoid}
            onDuplicate={onDuplicate}
          />
        )}
      </div>
    </section>
  );
}
