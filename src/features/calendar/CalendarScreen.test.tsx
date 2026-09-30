import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarScreen } from "./CalendarScreen";
import type { CalendarDayModel } from "../calendarTransactions/calendarTransactionModel";

function buildDays(): CalendarDayModel[] {
  const start = new Date(Date.UTC(2026, 7, 31));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const iso = date.toISOString().slice(0, 10);
    const selected = iso === "2026-09-15";
    return {
      date: iso,
      dayOfMonth: date.getUTCDate(),
      inSelectedMonth: iso.startsWith("2026-09"),
      isToday: iso === "2026-09-30",
      entries: selected ? [
        { id: "event", kind: "EVENT", label: "Dentist" },
        { id: "note", kind: "NOTE", label: "Paper note" },
        { id: "plan", kind: "PLANNED", label: "Insurance due", recurring: true },
        { id: "income", kind: "ACTUAL_INCOME", label: "Salary", amount: { amountMinor: 500_000, currencyCode: "HUF" }, movementId: "m-income" },
        { id: "expense", kind: "ACTUAL_EXPENSE", label: "Groceries", amount: { amountMinor: 30_000, currencyCode: "HUF" }, movementId: "m-expense" },
      ] : [],
    } satisfies CalendarDayModel;
  });
}


const model = {
  selectedMonth: "2026-09",
  days: buildDays(),
};

describe("CalendarScreen", () => {
  it("renders Integrated Calendar with 9/3-ready selected-day structure and quick-add actions", () => {
    const html = renderToStaticMarkup(
      <CalendarScreen
        language="EN"
        model={model}
        initialSelectedDate="2026-09-15"
      />,
    );

    expect(html).toContain('data-calendar-mode="integrated"');
    expect(html).toContain("hcf-calendar-screen--selected");
    expect(html).toContain("hcf-day-panel");
    expect(html).toContain("Events / Notes");
    expect(html).toContain("Expected / Planned");
    expect(html).toContain("Actual movements");
    expect(html).toContain(">Event<");
    expect(html).toContain(">Income<");
    expect(html).toContain(">Expense<");
    expect(html).toContain(">Note<");
    expect(html).toContain("Insurance due");
    expect(html).toContain("Salary");
  });

  it("renders paper-dominant Focus Mode and Exit Focus control", () => {
    const html = renderToStaticMarkup(
      <CalendarScreen
        language="EN"
        model={model}
        initialMode="FOCUS"
        initialSelectedDate="2026-09-15"
      />,
    );

    expect(html).toContain('data-calendar-mode="focus"');
    expect(html).toContain("hcf-calendar-screen--focus");
    expect(html).toContain("Exit Focus");
    expect(html).toContain("hcf-day-panel");
  });

  it("uses explicit non-color-only entry markers", () => {
    const html = renderToStaticMarkup(
      <CalendarScreen language="EN" model={model} initialSelectedDate="2026-09-15" />,
    );

    expect(html).toContain("actual income: Salary");
    expect(html).toContain("planned: Insurance due");
    expect(html).toContain("recurring");
  });
});
