import { useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import type {
  ComparisonSeries,
  OutlookMode,
  OverviewViewModel,
  TrajectorySeries,
} from "../presentation/presentationModel";
import {
  chartExtent,
  formatMoney,
} from "../presentation/presentationModel";
import { presentationText } from "../presentation/presentationText";
import "./overview.css";

type Props = {
  language: LanguageCode;
  model: OverviewViewModel;
  initialOutlookMode?: OutlookMode;
  onOutlookModeChange?: (mode: OutlookMode) => void;
  onViewAllTransactions?: () => void;
  onOpenCalendar?: () => void;
  onOpenAccounts?: () => void;
};

function InfoHint({ text, language }: { text: string; language: LanguageCode }) {
  return (
    <span className="hcf-info-hint">
      <button
        type="button"
        className="hcf-info-hint__button"
        aria-label={presentationText(language, "information")}
        aria-describedby={undefined}
      >
        i
      </button>
      <span className="hcf-info-hint__popover" role="tooltip">{text}</span>
    </span>
  );
}

function ComparisonChart({
  series,
  language,
}: {
  series: ComparisonSeries;
  language: LanguageCode;
}) {
  if (series.points.length === 0) {
    return (
      <div className="hcf-chart-empty">
        {series.incomplete ? presentationText(language, "fxUnavailable") : "—"}
      </div>
    );
  }

  const extent = chartExtent(
    series.points.flatMap(point => [
      point.incomeMinor,
      point.spendingMinor,
      point.resultMinor,
    ]),
  );

  return (
    <div className="hcf-comparison-chart" aria-label={presentationText(language, "comparison")}>
      {series.points.map(point => (
        <div className="hcf-comparison-chart__month" key={point.monthId}>
          <div className="hcf-comparison-chart__bars" aria-hidden="true">
            <span
              className="hcf-chart-bar hcf-chart-bar--income"
              style={{ height: `${Math.max(4, Math.round(Math.abs(point.incomeMinor) / extent * 100))}%` }}
            />
            <span
              className="hcf-chart-bar hcf-chart-bar--spending"
              style={{ height: `${Math.max(4, Math.round(Math.abs(point.spendingMinor) / extent * 100))}%` }}
            />
            <span
              className="hcf-chart-bar hcf-chart-bar--result"
              data-negative={point.resultMinor < 0 ? "true" : "false"}
              style={{ height: `${Math.max(4, Math.round(Math.abs(point.resultMinor) / extent * 100))}%` }}
            />
          </div>
          <span>{point.label}</span>
          <span className="sr-only">
            {presentationText(language, "income")} {formatMoney({ amountMinor: point.incomeMinor, currencyCode: series.currencyCode }, language)};
            {presentationText(language, "spending")} {formatMoney({ amountMinor: point.spendingMinor, currencyCode: series.currencyCode }, language)};
            {presentationText(language, "monthlyResult")} {formatMoney({ amountMinor: point.resultMinor, currencyCode: series.currencyCode }, language)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrajectoryChart({
  series,
  language,
}: {
  series: TrajectorySeries;
  language: LanguageCode;
}) {
  if (series.points.length === 0) {
    return (
      <div className="hcf-chart-empty">
        {series.incomplete ? presentationText(language, "fxUnavailable") : "—"}
      </div>
    );
  }

  const values = series.points.flatMap(point => [
    point.actualMinor,
    ...(point.forecastMinor === undefined ? [] : [point.forecastMinor]),
  ]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const width = 100;
  const height = 40;

  const pointFor = (value: number, index: number, count: number) => {
    const x = count === 1 ? width / 2 : index / (count - 1) * width;
    const y = height - ((value - min) / span) * height;
    return `${x},${y}`;
  };

  const actual = series.points
    .map((point, index) => pointFor(point.actualMinor, index, series.points.length))
    .join(" ");

  const forecast = series.points
    .map((point, index) =>
      point.forecastMinor === undefined
        ? null
        : pointFor(point.forecastMinor, index, series.points.length),
    )
    .filter((point): point is string => Boolean(point))
    .join(" ");

  return (
    <div className="hcf-trajectory-chart">
      <svg
        viewBox="0 0 100 40"
        role="img"
        aria-label={presentationText(language, "trajectory")}
        preserveAspectRatio="none"
      >
        <polyline className="hcf-trajectory-line hcf-trajectory-line--actual" points={actual} />
        {forecast && (
          <polyline className="hcf-trajectory-line hcf-trajectory-line--forecast" points={forecast} />
        )}
      </svg>
      <div className="hcf-trajectory-chart__labels">
        {series.points.map(point => <span key={point.date}>{point.label}</span>)}
      </div>
    </div>
  );
}

export function OverviewScreen({
  language,
  model,
  initialOutlookMode = "COMPARISON",
  onOutlookModeChange,
  onViewAllTransactions,
  onOpenCalendar,
  onOpenAccounts,
}: Props) {
  const [outlookMode, setOutlookMode] = useState<OutlookMode>(initialOutlookMode);

  function changeOutlookMode(mode: OutlookMode) {
    setOutlookMode(mode);
    onOutlookModeChange?.(mode);
  }

  return (
    <section className="hcf-overview-screen" aria-label={model.selectedMonth}>
      <div className="hcf-overview-kpis">
        {model.kpis.map(kpi => (
          <article className="hcf-overview-card hcf-kpi-card" key={kpi.id}>
            <header>
              <span>{kpi.label}</span>
              <InfoHint text={kpi.helpText} language={language} />
            </header>
            <strong className="hcf-kpi-value">
              {kpi.value ? formatMoney(kpi.value, language) : "—"}
            </strong>
            {kpi.secondaryText && <span className="hcf-card-muted">{kpi.secondaryText}</span>}
            {kpi.incomplete && (
              <span className="hcf-card-warning">
                {presentationText(language, "fxUnavailable")}
              </span>
            )}
          </article>
        ))}
      </div>

      <article className="hcf-overview-card hcf-overview-outlook">
        <header className="hcf-card-header">
          <div>
            <strong>{presentationText(language, "month")}: {model.selectedMonth}</strong>
          </div>
          <div className="hcf-segmented" role="group" aria-label="Cash-flow outlook">
            <button
              type="button"
              className={outlookMode === "COMPARISON" ? "is-active" : ""}
              aria-pressed={outlookMode === "COMPARISON"}
              onClick={() => changeOutlookMode("COMPARISON")}
            >
              {presentationText(language, "comparison")}
            </button>
            <button
              type="button"
              className={outlookMode === "TRAJECTORY" ? "is-active" : ""}
              aria-pressed={outlookMode === "TRAJECTORY"}
              onClick={() => changeOutlookMode("TRAJECTORY")}
            >
              {presentationText(language, "trajectory")}
            </button>
          </div>
        </header>

        <div className="hcf-chart-surface">
          {outlookMode === "COMPARISON" ? (
            <ComparisonChart series={model.comparison} language={language} />
          ) : (
            <TrajectoryChart series={model.trajectory} language={language} />
          )}
          {((outlookMode === "COMPARISON" && model.comparison.incomplete) ||
            (outlookMode === "TRAJECTORY" && model.trajectory.incomplete)) && (
            <p className="hcf-card-warning">{presentationText(language, "fxUnavailable")}</p>
          )}
        </div>
      </article>

      <article className="hcf-overview-card hcf-overview-recent">
        <header className="hcf-card-header">
          <strong>{presentationText(language, "recentTransactions")}</strong>
          <button type="button" className="hcf-text-button" onClick={onViewAllTransactions}>
            {presentationText(language, "viewAll")}
          </button>
        </header>
        <div className="hcf-compact-list">
          {model.recentTransactions.length === 0 && (
            <p className="hcf-empty">{presentationText(language, "noTransactions")}</p>
          )}
          {model.recentTransactions.slice(0, 7).map(transaction => (
            <div className="hcf-transaction-row" key={transaction.movementId}>
              <div>
                <strong>{transaction.description}</strong>
                <span>{transaction.occurredOn}</span>
              </div>
              <span className="hcf-transaction-type">{transaction.movementType}</span>
              <strong>
                {formatMoney(transaction.amount, language)}
                {transaction.counterAmount ? ` → ${formatMoney(transaction.counterAmount, language)}` : ""}
              </strong>
            </div>
          ))}
        </div>
      </article>

      <article className="hcf-overview-card hcf-overview-upcoming">
        <header className="hcf-card-header">
          <strong>{presentationText(language, "upcoming")}</strong>
          {onOpenCalendar && (
            <button type="button" className="hcf-text-button" onClick={onOpenCalendar}>
              {presentationText(language, "viewAll")}
            </button>
          )}
        </header>
        <div className="hcf-upcoming-grid">
          {model.upcoming.length === 0 && (
            <p className="hcf-empty">{presentationText(language, "noUpcoming")}</p>
          )}
          {model.upcoming.slice(0, 8).map(item => (
            <div className="hcf-upcoming-row" key={item.id}>
              <time dateTime={item.date}>{item.date}</time>
              <strong>{item.label}</strong>
              <span>{item.kind}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="hcf-overview-card hcf-overview-position">
        <header className="hcf-card-header">
          <strong>{presentationText(language, "position")}</strong>
          {onOpenAccounts && (
            <button type="button" className="hcf-text-button" onClick={onOpenAccounts}>
              {presentationText(language, "accounts")}
            </button>
          )}
        </header>

        <div className="hcf-position-list">
          {model.positions.map(row => (
            <div className="hcf-position-row" key={row.id}>
              <strong>{row.label}</strong>
              <span>{formatMoney(row.position, language)}</span>
              <span>{presentationText(language, "allocated")}: {formatMoney(row.allocated, language)}</span>
              <span>{presentationText(language, "free")}: {formatMoney(row.free, language)}</span>
            </div>
          ))}
        </div>

        {model.reportingEquivalent && (
          <div className="hcf-reporting-equivalent">
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
      </article>
    </section>
  );
}
