import { useMemo, useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import { formatMoney } from "../presentation/presentationModel";
import {
  accountTotalsByCurrency,
  type AccountsViewModel,
} from "../accountsPlanning/accountsPlanningModel";
import { accountsPlanningText as t } from "../accountsPlanning/accountsPlanningText";
import "../accountsPlanning/accountsPlanning.css";

type Subview = "ACCOUNTS" | "ALLOCATIONS";

type Props = {
  language: LanguageCode;
  model: AccountsViewModel;
  initialSubview?: Subview;
  onAddAccount?: () => void;
  onTransfer?: () => void;
  onReconcile?: () => void;
  onTransferReserve?: () => void;
  onOpenAccount?: (accountId: string) => void;
  onReserve?: () => void;
  onRelease?: (allocationId: string) => void;
  onApply?: (allocationId: string) => void;
  onAdjust?: (allocationId: string) => void;
};

export function AccountsScreen({
  language,
  model,
  initialSubview = "ACCOUNTS",
  onAddAccount,
  onTransfer,
  onReconcile,
  onTransferReserve,
  onOpenAccount,
  onReserve,
  onRelease,
  onApply,
  onAdjust,
}: Props) {
  const [subview, setSubview] = useState<Subview>(initialSubview);
  const totals = useMemo(() => accountTotalsByCurrency(model.accounts), [model.accounts]);

  return (
    <section className="hcf-ap-screen">
      <header className="hcf-ap-header">
        <div className="hcf-ap-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={subview === "ACCOUNTS"} className={subview === "ACCOUNTS" ? "is-active" : ""} onClick={() => setSubview("ACCOUNTS")}>
            {t(language, "accounts")}
          </button>
          <button type="button" role="tab" aria-selected={subview === "ALLOCATIONS"} className={subview === "ALLOCATIONS" ? "is-active" : ""} onClick={() => setSubview("ALLOCATIONS")}>
            {t(language, "allocations")}
          </button>
        </div>

        {subview === "ACCOUNTS" ? (
          <div className="hcf-ap-actions">
            <button type="button" onClick={onAddAccount}>+ {t(language, "addAccount")}</button>
            <button type="button" onClick={onTransfer}>{t(language, "transfer")}</button>
            <button type="button" onClick={onReconcile}>{t(language, "reconcile")}</button>
            <button type="button" onClick={onTransferReserve}>{t(language, "transferReserve")}</button>
          </div>
        ) : (
          <div className="hcf-ap-actions">
            <button type="button" onClick={onReserve}>+ {t(language, "reserve")}</button>
          </div>
        )}
      </header>

      {subview === "ACCOUNTS" ? (
        <>
          <section className="hcf-currency-summary" aria-label={t(language, "position")}>
            {totals.map(total => (
              <article key={total.currencyCode}>
                <strong>{total.currencyCode}</strong>
                <span>{t(language, "position")}: {formatMoney({ amountMinor: total.positionMinor, currencyCode: total.currencyCode }, language)}</span>
                <span>{t(language, "allocated")}: {formatMoney({ amountMinor: total.allocatedMinor, currencyCode: total.currencyCode }, language)}</span>
                <span>{t(language, "free")}: {formatMoney({ amountMinor: total.freeMinor, currencyCode: total.currencyCode }, language)}</span>
              </article>
            ))}

            {model.reportingEquivalent && (
              <article className="hcf-reporting-card">
                <strong>{t(language, "reportingEquivalent")}</strong>
                <span>{model.reportingEquivalent.value ? formatMoney(model.reportingEquivalent.value, language) : "—"}</span>
                {model.reportingEquivalent.fxContext && <small>{model.reportingEquivalent.fxContext}</small>}
                {model.reportingEquivalent.incomplete && <small>{t(language, "fxUnavailable")}</small>}
              </article>
            )}
          </section>

          <div className="hcf-ap-table" role="table" aria-label={t(language, "accounts")}>
            <div className="hcf-ap-row hcf-ap-row--head">
              <span>{t(language, "name")}</span>
              <span>{t(language, "type")}</span>
              <span>{t(language, "currency")}</span>
              <span>{t(language, "position")}</span>
              <span>{t(language, "allocated")}</span>
              <span>{t(language, "free")}</span>
              <span>{t(language, "status")}</span>
            </div>
            {model.accounts.map(row => (
              <button key={row.accountId} type="button" className="hcf-ap-row" onClick={() => onOpenAccount?.(row.accountId)}>
                <strong>{row.name}</strong>
                <span>{row.accountType}</span>
                <span>{row.currencyCode}</span>
                <span>{formatMoney(row.position, language)}</span>
                <span>{formatMoney(row.allocated, language)}</span>
                <span>{formatMoney(row.free, language)}</span>
                <span>{t(language, row.active ? "active" : "inactive")}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="hcf-ap-table hcf-ap-table--allocations" role="table" aria-label={t(language, "allocations")}>
          <div className="hcf-ap-row hcf-ap-row--head">
            <span>{t(language, "purpose")}</span>
            <span>{t(language, "account")}</span>
            <span>{t(language, "currency")}</span>
            <span>{t(language, "reserved")}</span>
            <span>{t(language, "applied")}</span>
            <span>{t(language, "remaining")}</span>
            <span>{t(language, "status")}</span>
            <span>{t(language, "linkedPlan")}</span>
            <span>·</span>
          </div>
          {model.allocations.map(row => (
            <div key={row.allocationId} className="hcf-ap-row hcf-allocation-row">
              <strong>{row.purpose}</strong>
              <span>{row.accountLabel}</span>
              <span>{row.currencyCode}</span>
              <span>{formatMoney(row.reserved, language)}</span>
              <span>{formatMoney(row.applied, language)}</span>
              <span>{formatMoney(row.remaining, language)}</span>
              <span>
                {row.state}
                {row.overAllocated && <small className="hcf-ap-warning">{t(language, "overAllocated")}</small>}
              </span>
              <span>{row.linkedPlanLabel || "—"}</span>
              <span className="hcf-inline-actions">
                <button type="button" onClick={() => onRelease?.(row.allocationId)}>{t(language, "release")}</button>
                <button type="button" onClick={() => onApply?.(row.allocationId)}>{t(language, "apply")}</button>
                <button type="button" onClick={() => onAdjust?.(row.allocationId)}>{t(language, "adjust")}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
