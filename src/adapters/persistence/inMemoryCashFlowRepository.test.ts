import { describe, expect, it } from "vitest";
import { InMemoryCashFlowRepository } from "./inMemoryCashFlowRepository";

describe("InMemoryCashFlowRepository", () => {
  it("partitions workspaces by owner identity", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save({
      workspaceId: "home",
      ownerPartitionId: "owner-a",
      schemaVersion: 1,
      currency: "HUF",
      bufferPolicy: {
        roundingValueHuf: 1_000,
        roundingThresholdHuf: 500,
        applyToFixed: false,
      },
      items: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });

    expect(await repository.load("owner-a", "home")).not.toBeNull();
    expect(await repository.load("owner-b", "home")).toBeNull();
  });
});
