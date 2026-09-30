import { useMemo, useState } from "react";
import type { LanguageCode } from "../../domain/ownerPreferences";
import { formatMoney, languageLocale } from "../presentation/presentationModel";
import {
  partitionSelectedDay,
  validateCalendarMonthModel,
  visibleCalendarEntries,
  type CalendarDayModel,
  type CalendarEntryKind,
  type CalendarEntryModel,
  type CalendarMonthViewModel,
  type CalendarQuickAddKind,
} from "../calendarTransactions/calendarTransactionModel";
import { calendarTransactionText as t } from "../calendarTransactions/calendarTransactionText";
import "./calendar.css";

type CalendarMode = "INTEGRATED" | "FOCUS";

type Props = {
  language: LanguageCode;
  model: CalendarMonthViewModel;
  initialMode?: CalendarMode;
  initialSelectedDate?: string;
  onModeChange?: (mode: CalendarMode) => void;
  onPreviousMonth?: () => void;
  onNextMonth?: () => void;
  onCurrentMonth?: () => void;
  onSelectedMonthChange?: (monthId: string) => void;
  onQuickAdd?: (date: string, kind: CalendarQuickAddKind) => void;
  onOpenEntry?: (entryId: string) => void;
};

const KIND_SYMBOL: Record<CalendarEntryKind, string> = {
  EVENT: "•",
  NOTE: "✎",
  PLANNED: "P",
  ACTUAL_INCOME: "+",
  ACTUAL_EXPENSE: "−",
  TRANSFER: "↔",
  WORK: "W",
};

function weekdayLabels(language: LanguageCode): string[] {
  const formatter = new Intl.DateTimeFormat(languageLocale(language), { weekday: "short" });
  const monday = new Date(Date.UTC(2026, 0, 5));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatter.format(date);
  });
}

function EntryLine({
  entry,
  language,
  onOpen,
}: {
  entry: CalendarEntryModel;
  language: LanguageCode;
  onOpen?: (entryId: string) => void;
}) {
  const amount = entry.amount ? formatMoney(entry.amount, language) : "";
  const accessibleKind = entry.kind.replaceAll("_", " ").toLocaleLowerCase();
  return (
    <button
      type="button"
      className={`hcf-calendar-entry hcf-calendar-entry--${entry.kind.toLocaleLowerCase()}`}
      aria-label={`${accessibleKind}: ${entry.label}${amount ? `, ${amount}` : ""}${entry.recurring ? ", recurring" : ""}`}
      onClick={event => {
        event.stopPropagation();
        onOpen?.(entry.id);
      }}
    >
      <span className="hcf-calendar-entry__symbol" aria-hidden="true">
        {KIND_SYMBOL[entry.kind]}
      </span>
      <span className="hcf-calendar-entry__label">{entry.label}</span>
      {entry.amount && <span className="hcf-calendar-entry__amount">{amount}</span>}
      {entry.recurring && <span className="hcf-calendar-entry__recurring" aria-hidden="true">↻</span>}
    </button>
  );
}

function QuickAddChooser({
  language,
  date,
  onChoose,
}: {
  language: LanguageCode;
  date: string;
  onChoose: (kind: CalendarQuickAddKind) => void;
}) {
  const choices: Array<[CalendarQuickAddKind, "addEvent" | "addIncome" | "addExpense" | "addNote"]> = [
    ["EVENT", "addEvent"],
    ["INCOME", "addIncome"],
    ["EXPENSE", "addExpense"],
    ["NOTE", "addNote"],
  ];

  return (
    <div className="hcf-calendar-quick-chooser" aria-label={date}>
      {choices.map(([kind, label]) => (
        <button key={kind} type="button" onClick={() => onChoose(kind)}>
          {t(language, label)}
        </button>
      ))}
    </div>
  );
}

function DaySection({
  title,
  entries,
  language,
  onOpenEntry,
}: {
  title: string;
  entries: CalendarEntryModel[];
  language: LanguageCode;
  onOpenEntry?: (entryId: string) => void;
}) {
  return (
    <section className="hcf-day-panel__section">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="hcf-calendar-empty">{t(language, "noDayEntries")}</p>
      ) : (
        <div className="hcf-day-panel__entries">
          {entries.map(entry => (
            <EntryLine key={entry.id} entry={entry} language={language} onOpen={onOpenEntry} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CalendarScreen({
  language,
  model,
  initialMode = "INTEGRATED",
  initialSelectedDate,
  onModeChange,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  onSelectedMonthChange,
  onQuickAdd,
  onOpenEntry,
}: Props) {
  validateCalendarMonthModel(model);

  const [mode, setMode] = useState<CalendarMode>(initialMode);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate ?? null,
  );
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

  const selectedDay = useMemo(
    () => model.days.find(day => day.date === selectedDate) ?? null,
    [model.days, selectedDate],
  );
  const selected = selectedDay ? partitionSelectedDay(selectedDay) : null;
  const focusMode = mode === "FOCUS";
  const weekdays = weekdayLabels(language);

  function changeMode(next: CalendarMode) {
    setMode(next);
    setQuickAddDate(null);
    onModeChange?.(next);
  }

  function selectDay(day: CalendarDayModel) {
    setSelectedDate(day.date);
    setQuickAddDate(null);
  }

  function chooseQuickAdd(date: string, kind: CalendarQuickAddKind) {
    setSelectedDate(date);
    setQuickAddDate(null);
    onQuickAdd?.(date, kind);
  }

  return (
    <section
      className={[
        "hcf-calendar-screen",
        focusMode ? "hcf-calendar-screen--focus" : "hcf-calendar-screen--integrated",
        selectedDay ? "hcf-calendar-screen--selected" : "",
      ].filter(Boolean).join(" ")}
      data-calendar-mode={mode.toLowerCase()}
    >
      <header className="hcf-calendar-toolbar">
        <div className="hcf-calendar-toolbar__month">
          <button type="button" aria-label={t(language, "previousMonth")} onClick={onPreviousMonth}>‹</button>
          <label>
            <span className="sr-only">{t(language, "calendar")}</span>
            <input
              type="month"
              value={model.selectedMonth}
              onChange={event => onSelectedMonthChange?.(event.target.value)}
            />
          </label>
          <button type="button" aria-label={t(language, "nextMonth")} onClick={onNextMonth}>›</button>
          <button type="button" className="hcf-calendar-today" onClick={onCurrentMonth}>
            {t(language, "today")}
          </button>
        </div>

        <button
          type="button"
          className="hcf-calendar-focus-action"
          onClick={() => changeMode(focusMode ? "INTEGRATED" : "FOCUS")}
        >
          {focusMode ? `← ${t(language, "exitFocus")}` : `⤢ ${t(language, "focusCalendar")}`}
        </button>
      </header>

      <div className="hcf-calendar-layout">
        <div className="hcf-calendar-surface">
          <div className="hcf-calendar-weekdays" aria-hidden="true">
            {weekdays.map(label => <span key={label}>{label}</span>)}
          </div>

          <div className="hcf-calendar-grid" role="grid" aria-label={model.selectedMonth}>
            {model.days.map(day => {
              const density = visibleCalendarEntries(day.entries, focusMode);
              const isSelected = day.date === selectedDate;
              return (
                <article
                  key={day.date}
                  className={[
                    "hcf-calendar-day",
                    !day.inSelectedMonth ? "hcf-calendar-day--outside" : "",
                    day.isToday ? "hcf-calendar-day--today" : "",
                    isSelected ? "hcf-calendar-day--selected" : "",
                  ].filter(Boolean).join(" ")}
                  role="gridcell"
                  aria-selected={isSelected}
                  onClick={() => selectDay(day)}
                >
                  <header className="hcf-calendar-day__header">
                    <button
                      type="button"
                      className="hcf-calendar-day__number"
                      aria-label={day.date}
                      onClick={event => {
                        event.stopPropagation();
                        selectDay(day);
                      }}
                    >
                      {day.dayOfMonth}
                    </button>
                    <button
                      type="button"
                      className="hcf-calendar-day__quick"
                      aria-label={`${day.date}: quick add`}
                      aria-expanded={quickAddDate === day.date}
                      onClick={event => {
                        event.stopPropagation();
                        setSelectedDate(day.date);
                        setQuickAddDate(current => current === day.date ? null : day.date);
                      }}
                    >
                      +
                    </button>
                  </header>

                  <div className="hcf-calendar-day__entries">
                    {density.visible.map(entry => (
                      <EntryLine key={entry.id} entry={entry} language={language} onOpen={onOpenEntry} />
                    ))}
                    {density.overflowCount > 0 && (
                      <button
                        type="button"
                        className="hcf-calendar-overflow"
                        onClick={event => {
                          event.stopPropagation();
                          selectDay(day);
                        }}
                      >
                        +{density.overflowCount} {t(language, "more")}
                      </button>
                    )}
                  </div>

                  {quickAddDate === day.date && (
                    <QuickAddChooser
                      language={language}
                      date={day.date}
                      onChoose={kind => chooseQuickAdd(day.date, kind)}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </div>

        {selected && (
          <aside className="hcf-day-panel" aria-label={`${t(language, "selectedDay")}: ${selected.date}`}>
            <header className="hcf-day-panel__header">
              <div>
                <span>{t(language, "selectedDay")}</span>
                <strong>{selected.date}</strong>
              </div>
              <button
                type="button"
                aria-label={t(language, "close")}
                onClick={() => {
                  setSelectedDate(null);
                  setQuickAddDate(null);
                }}
              >
                ×
              </button>
            </header>

            <DaySection
              title={t(language, "eventsNotes")}
              entries={selected.eventsAndNotes}
              language={language}
              onOpenEntry={onOpenEntry}
            />
            <DaySection
              title={t(language, "expectedPlanned")}
              entries={selected.expectedAndPlanned}
              language={language}
              onOpenEntry={onOpenEntry}
            />
            <DaySection
              title={t(language, "actualMovements")}
              entries={selected.actualMovements}
              language={language}
              onOpenEntry={onOpenEntry}
            />

            <section className="hcf-day-panel__actions">
              <button type="button" onClick={() => chooseQuickAdd(selected.date, "EVENT")}>{t(language, "addEvent")}</button>
              <button type="button" onClick={() => chooseQuickAdd(selected.date, "INCOME")}>{t(language, "addIncome")}</button>
              <button type="button" onClick={() => chooseQuickAdd(selected.date, "EXPENSE")}>{t(language, "addExpense")}</button>
              <button type="button" onClick={() => chooseQuickAdd(selected.date, "NOTE")}>{t(language, "addNote")}</button>
            </section>
          </aside>
        )}
      </div>
    </section>
  );
}
