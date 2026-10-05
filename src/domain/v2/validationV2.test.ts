import { describe, expect, it } from "vitest";
import type { CashFlowWorkspaceV2 } from "./cashFlowV2";
import {
  DomainV2ValidationError,
  emptySourceStateV2,
  validateMoney,
  validateWorkspaceV2,
} from "./validationV2";

function workspaceWithMovement(): CashFlowWorkspaceV2 {
  const sourceState = emptySourceStateV2();
  sourceState.accounts.push({
    accountId: "bank-huf",
    name: "Main bank",
    accountType: "BANK",
    currencyCode: "HUF",
    active: true,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
  });
  sourceState.moneyMovements.push({
    movementId: "movement-1",
    movementType: "INCOME",
    lifecycleStatus: "ACTIVE",
    currentRevisionNo: 1,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
  });
  sourceState.moneyMovementRevisions.push({
    movementRevisionId: "movement-1-r1",
    movementId: "movement-1",
    revisionNo: 1,
    changedAt: "2026-09-30T00:00:00Z",
    payload: {
      movementType: "INCOME",
      occurredOn: "2026-09-30",
      amount: { amountMinor: 125_000, currencyCode: "HUF" },
      accountId: "bank-huf",
      description: "Salary",
    },
  });

  return {
    workspaceId: "home",
    ownerPartitionId: "owner-a",
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision: 1,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
    sourceState,
  };
}

describe("HCF canonical v2 domain", () => {
  it("accepts integer HUF and EUR Money and rejects binary-float amounts", () => {
    expect(() => validateMoney({ amountMinor: 123_456, currencyCode: "HUF" })).not.toThrow();
    expect(() => validateMoney({ amountMinor: 12_345, currencyCode: "EUR" })).not.toThrow();
    expect(() => validateMoney({ amountMinor: 12.34, currencyCode: "EUR" })).toThrow(
      DomainV2ValidationError,
    );
  });

  it("validates stable MoneyMovement identity with an immutable revision shell", () => {
    expect(() => validateWorkspaceV2(workspaceWithMovement())).not.toThrow();
  });

  it("accepts explicit same-day anchor coverage and rejects unknown values", () => {
    const workspace = workspaceWithMovement();
    workspace.sourceState.accountBalanceAnchors.push({
      accountBalanceAnchorId: "opening",
      accountId: "bank-huf",
      anchorType: "INITIAL",
      balance: { amountMinor: 100_000, currencyCode: "HUF" },
      effectiveAt: "2026-09-30T12:00:00Z",
      sameDayCoverage: "BEFORE_MOVEMENTS",
    });
    expect(() => validateWorkspaceV2(workspace)).not.toThrow();
    workspace.sourceState.accountBalanceAnchors[0].sameDayCoverage = "AFTER_MOVEMENTS";
    expect(() => validateWorkspaceV2(workspace)).not.toThrow();
    workspace.sourceState.accountBalanceAnchors[0].sameDayCoverage = "UNKNOWN" as "BEFORE_MOVEMENTS";
    expect(() => validateWorkspaceV2(workspace)).toThrow("sameDayCoverage is invalid");
  });

  it("requires currentRevisionNo to point to the latest movement revision", () => {
    const workspace = workspaceWithMovement();
    workspace.sourceState.moneyMovementRevisions.push({
      movementRevisionId: "movement-1-r2",
      movementId: "movement-1",
      revisionNo: 2,
      changedAt: "2026-09-30T01:00:00Z",
      payload: {
        movementType: "INCOME",
        occurredOn: "2026-09-30",
        amount: { amountMinor: 126_000, currencyCode: "HUF" },
        accountId: "bank-huf",
        description: "Corrected salary",
      },
    });

    expect(() => validateWorkspaceV2(workspace)).toThrow(
      "MoneyMovement currentRevisionNo must point to the latest revision.",
    );

    workspace.sourceState.moneyMovements[0].currentRevisionNo = 2;
    expect(() => validateWorkspaceV2(workspace)).not.toThrow();
  });

  it("rejects transfer/account currency mismatches", () => {
    const workspace = workspaceWithMovement();
    workspace.sourceState.accounts.push({
      accountId: "eur-savings",
      name: "EUR savings",
      accountType: "SAVINGS",
      currencyCode: "EUR",
      active: true,
      createdAt: "2026-09-30T00:00:00Z",
      updatedAt: "2026-09-30T00:00:00Z",
    });
    workspace.sourceState.moneyMovements = [{
      movementId: "transfer-1",
      movementType: "TRANSFER",
      lifecycleStatus: "ACTIVE",
      currentRevisionNo: 1,
      createdAt: "2026-09-30T00:00:00Z",
      updatedAt: "2026-09-30T00:00:00Z",
    }];
    workspace.sourceState.moneyMovementRevisions = [{
      movementRevisionId: "transfer-1-r1",
      movementId: "transfer-1",
      revisionNo: 1,
      changedAt: "2026-09-30T00:00:00Z",
      payload: {
        movementType: "TRANSFER",
        occurredOn: "2026-09-30",
        sourceAccountId: "bank-huf",
        destinationAccountId: "eur-savings",
        sourceAmount: { amountMinor: 10_000, currencyCode: "HUF" },
        destinationAmount: { amountMinor: 25_000, currencyCode: "HUF" },
        description: "FX transfer",
      },
    }];

    expect(() => validateWorkspaceV2(workspace)).toThrow(
      "Transfer destination currency must match destination account currency.",
    );
  });
});
