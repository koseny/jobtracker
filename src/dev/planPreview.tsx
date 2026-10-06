import React from "react";
import { createRoot } from "react-dom/client";
import { InMemoryOwnerPreferencesRepository } from "../adapters/persistence/inMemoryOwnerPreferencesRepository";
import { IndexedDbCashFlowRepositoryV2Rehearsal } from "../adapters/persistence/indexedDbCashFlowRepositoryV2Rehearsal";
import { createPlanItemV2 } from "../application/createPlanItemV2";
import type { CashFlowWorkspaceV2, PlanDirection } from "../domain/v2/cashFlowV2";
import { emptySourceStateV2 } from "../domain/v2/validationV2";
import { HcfDormantV2Application } from "../features/dormantApp/HcfDormantV2Application";
import "../styles.css";

// This entry is served by Vite in development only. It has no production build input.
const ownerPartitionId = "local-rehearsal-owner";
const workspaceId = "home";
const selectedMonth = new Date().toISOString().slice(0, 7);
const financialRepository = new IndexedDbCashFlowRepositoryV2Rehearsal("civilbonus-hcf-local-plan-preview-v2");
const preferencesRepository = new InMemoryOwnerPreferencesRepository();

async function preparePreview() {
  const existing = await financialRepository.load(ownerPartitionId, workspaceId);
  if (existing) return;
  const changedAt = new Date().toISOString();
  let workspace: CashFlowWorkspaceV2 = {
    workspaceId, ownerPartitionId, schemaVersion: 2, reportingCurrencyCode: "HUF",
    revision: 1, createdAt: changedAt, updatedAt: changedAt,
    sourceState: emptySourceStateV2(),
  };
  await financialRepository.save(ownerPartitionId, workspace, null);
  const examples: { name: string; direction: PlanDirection; amountMinor: number }[] = [
    { name: "Salary", direction: "INCOME", amountMinor: 600000 },
    { name: "Rent", direction: "EXPENSE", amountMinor: 180000 },
    { name: "Groceries", direction: "EXPENSE", amountMinor: 85000 },
  ];
  for (const example of examples) {
    workspace = await createPlanItemV2(financialRepository, {
      ownerPartitionId, workspaceId, expectedRevision: workspace.revision,
      changedAt: new Date().toISOString(), planItemId: crypto.randomUUID(),
      item: { monthId: selectedMonth, direction: example.direction, name: example.name,
        currentPlannedAmount: { amountMinor: example.amountMinor, currencyCode: "HUF" } },
    });
  }
}

const root = createRoot(document.getElementById("root")!);
preparePreview().then(() => root.render(
  <React.StrictMode>
    <div style={{ padding: "8px 16px", background: "#e7f4ec", color: "#164b2a", fontWeight: 700 }}>
      Local rehearsal · sample data · stored only in this browser
    </div>
    <HcfDormantV2Application
      user={{ id: ownerPartitionId, displayName: "Preview", email: null, photoUrl: null }}
      preferencesRepository={preferencesRepository}
      financialRepository={financialRepository}
      workspaceId={workspaceId}
      initialDestination="month"
      initialSelectedMonth={selectedMonth}
      onSignOut={async () => {}}
    />
  </React.StrictMode>,
)).catch(cause => {
  console.error(cause);
  root.render(<main role="alert" style={{ padding: 24 }}>Unable to prepare the local rehearsal workspace: {cause instanceof Error ? cause.message : String(cause)}</main>);
});
