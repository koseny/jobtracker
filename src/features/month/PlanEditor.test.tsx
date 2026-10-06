import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlanItem } from "../../domain/v2/cashFlowV2";
import { PlanEditor } from "./PlanEditor";

const callbacks = { onClose: () => {}, onCreate: () => {}, onDetails: () => {}, onAmount: () => {}, onCancel: () => {} };
const item: PlanItem = {
  planItemId: "rent", monthId: "2026-10", direction: "EXPENSE", sortOrder: 0,
  name: "Rent", currentPlannedAmount: { amountMinor: 180000, currencyCode: "HUF" },
  planStatus: "ACTIVE", completionStatus: "OPEN", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z",
};

describe("PlanEditor", () => {
  it("shows an entry form with direction, amount and native currency", () => {
    const html = renderToStaticMarkup(<PlanEditor {...callbacks} language="EN"
      selection={{ kind: "CREATE", direction: "INCOME", monthId: "2026-10" }} busy={false} error={null} />);
    expect(html).toContain("Add plan item");
    expect(html).toContain("INCOME");
    expect(html).toContain("Planned amount");
    expect(html).toContain("EUR");
    expect(html).not.toContain("Confirm cancellation");
  });

  it("separates details, amount revision and cancellation", () => {
    const html = renderToStaticMarkup(<PlanEditor {...callbacks} language="EN"
      selection={{ kind: "EDIT", item }} busy={false} error={null} />);
    expect(html).toContain("Save details");
    expect(html).toContain("Change amount");
    expect(html).toContain("Cancel plan item");
    expect(html).toContain("180000");
  });
});
