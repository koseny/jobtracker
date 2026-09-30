import { useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import { formatMoney } from "../presentation/presentationModel";
import {
  recurrenceLabelKey,
  type PlanningViewModel,
} from "../accountsPlanning/accountsPlanningModel";
import { accountsPlanningText as t } from "../accountsPlanning/accountsPlanningText";
import "../accountsPlanning/accountsPlanning.css";

type Subview = "TEMPLATES" | "INCOME_WORK";

type Props = {
  language: LanguageCode;
  model: PlanningViewModel;
  initialSubview?: Subview;
  onAddTemplate?: () => void;
  onOpenTemplate?: (planTemplateId: string) => void;
  onAddIncomeSource?: () => void;
  onOpenIncomeSource?: (incomeSourceId: string) => void;
  onRecordPayment?: (workOccurrenceId: string) => void;
};

export function PlanningScreen({
  language,
  model,
  initialSubview = "TEMPLATES",
  onAddTemplate,
  onOpenTemplate,
  onAddIncomeSource,
  onOpenIncomeSource,
  onRecordPayment,
}: Props) {
  const [subview, setSubview] = useState<Subview>(initialSubview);

  return (
    <section className="hcf-ap-screen">
      <header className="hcf-ap-header">
        <div className="hcf-ap-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={subview === "TEMPLATES"} className={subview === "TEMPLATES" ? "is-active" : ""} onClick={() => setSubview("TEMPLATES")}>
            {t(language, "planTemplates")}
          </button>
          <button type="button" role="tab" aria-selected={subview === "INCOME_WORK"} className={subview === "INCOME_WORK" ? "is-active" : ""} onClick={() => setSubview("INCOME_WORK")}>
            {t(language, "incomeWork")}
          </button>
        </div>

        <div className="hcf-ap-actions">
          {subview === "TEMPLATES" ? (
            <button type="button" onClick={onAddTemplate}>+ {t(language, "planTemplates")}</button>
          ) : (
            <button type="button" onClick={onAddIncomeSource}>+ {t(language, "incomeSources")}</button>
          )}
        </div>
      </header>

      {subview === "TEMPLATES" ? (
        <div className="hcf-ap-table hcf-template-table" role="table" aria-label={t(language, "planTemplates")}>
          <div className="hcf-ap-row hcf-ap-row--head">
            <span>{t(language, "name")}</span>
            <span>{t(language, "direction")}</span>
            <span>{t(language, "plannedAmount")}</span>
            <span>{t(language, "currency")}</span>
            <span>{t(language, "recurrence")}</span>
            <span>{t(language, "timing")}</span>
            <span>{t(language, "categoryGroup")}</span>
            <span>{t(language, "status")}</span>
          </div>
          {model.templates.map(row => (
            <button key={row.planTemplateId} type="button" className="hcf-ap-row" onClick={() => onOpenTemplate?.(row.planTemplateId)}>
              <strong>{row.name}</strong>
              <span>{t(language, row.direction === "INCOME" ? "income" : "expense")}</span>
              <span>{formatMoney(row.plannedAmount, language)}</span>
              <span>{row.plannedAmount.currencyCode}</span>
              <span>{t(language, recurrenceLabelKey(row.recurrence))}</span>
              <span>{row.timingLabel || "—"}</span>
              <span>{row.categoryGroupLabel || "—"}</span>
              <span>{t(language, row.active ? "active" : "inactive")}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="hcf-income-work-grid">
          <section className="hcf-ap-card">
            <header><strong>{t(language, "incomeSources")}</strong></header>
            <div className="hcf-ap-table hcf-income-source-table">
              <div className="hcf-ap-row hcf-ap-row--head">
                <span>{t(language, "name")}</span>
                <span>{t(language, "unit")}</span>
                <span>{t(language, "unitPrice")}</span>
                <span>{t(language, "currency")}</span>
                <span>{t(language, "status")}</span>
              </div>
              {model.incomeSources.map(source => (
                <button key={source.incomeSourceId} type="button" className="hcf-ap-row" onClick={() => onOpenIncomeSource?.(source.incomeSourceId)}>
                  <strong>{source.name}</strong>
                  <span>{source.unit || "—"}</span>
                  <span>{source.unitPrice ? formatMoney(source.unitPrice, language) : "—"}</span>
                  <span>{source.defaultCurrency}</span>
                  <span>{t(language, source.active ? "active" : "inactive")}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="hcf-ap-card">
            <header>
              <div>
                <strong>{t(language, "workOccurrences")}</strong>
                <small>{t(language, "nonCashNotice")}</small>
              </div>
            </header>
            <div className="hcf-ap-table hcf-work-table">
              <div className="hcf-ap-row hcf-ap-row--head">
                <span>{t(language, "date")}</span>
                <span>{t(language, "source")}</span>
                <span>{t(language, "quantity")}</span>
                <span>{t(language, "expectedValue")}</span>
                <span>{t(language, "status")}</span>
                <span>·</span>
              </div>
              {model.workOccurrences.map(row => (
                <div key={row.workOccurrenceId} className="hcf-ap-row">
                  <span>{row.date}</span>
                  <strong>{row.sourceLabel}</strong>
                  <span>{row.quantity}{row.unit ? ` ${row.unit}` : ""}</span>
                  <span>{row.expectedValue ? formatMoney(row.expectedValue, language) : "—"}</span>
                  <span>{t(language, row.state === "COMPLETED" ? "completed" : "planned")}</span>
                  <span>
                    <button type="button" className="hcf-record-payment" onClick={() => onRecordPayment?.(row.workOccurrenceId)}>
                      {t(language, "recordPayment")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
