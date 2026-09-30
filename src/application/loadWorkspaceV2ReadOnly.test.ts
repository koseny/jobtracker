import { describe, expect, it } from "vitest";
import { InMemoryCashFlowRepositoryV2 } from "../adapters/persistence/inMemoryCashFlowRepositoryV2";
import type { CashFlowWorkspaceV2 } from "../domain/v2/cashFlowV2";
import { emptySourceStateV2 } from "../domain/v2/validationV2";
import { loadValidatedWorkspaceV2ReadOnly } from "./loadWorkspaceV2ReadOnly";

function emptyWorkspace(ownerPartitionId = "owner-a"): CashFlowWorkspaceV2 {
  return {
    workspaceId: "home",
    ownerPartitionId,
    schemaVersion: 2,
    reportingCurrencyCode: "HUF",
    revision: 1,
    createdAt: "2026-09-30T20:00:00Z",
    updatedAt: "2026-09-30T20:00:00Z",
    sourceState: emptySourceStateV2(),
  };
}

describe("loadValidatedWorkspaceV2ReadOnly", () => {
  it("loads a valid owner-scoped canonical workspace without mutating it", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();
    const source = emptyWorkspace();
    await repository.save("owner-a", source, null);

    const loaded = await loadValidatedWorkspaceV2ReadOnly(repository, "owner-a", "home");

    expect(loaded).toEqual(source);
    expect(loaded).not.toBe(source);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(source);
  });

  it("returns null for another owner partition instead of crossing ownership", async () => {
    const repository = new InMemoryCashFlowRepositoryV2();
    await repository.save("owner-a", emptyWorkspace("owner-a"), null);

    await expect(
      loadValidatedWorkspaceV2ReadOnly(repository, "owner-b", "home"),
    ).resolves.toBeNull();
  });
});
