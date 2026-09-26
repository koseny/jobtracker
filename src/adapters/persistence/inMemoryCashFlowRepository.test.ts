import { describe, expect, it } from "vitest";
import { InMemoryCashFlowRepository } from "./inMemoryCashFlowRepository";

describe("InMemoryCashFlowRepository", () => {
  it("partitions workspaces by owner identity", async () => {
    const repository = new InMemoryCashFlowRepository();
    await repository.save({ workspaceId: "home", ownerPartitionId: "owner-a", schemaVersion: 1, currency: "HUF" });

    expect(await repository.load("owner-a", "home")).not.toBeNull();
    expect(await repository.load("owner-b", "home")).toBeNull();
  });
});
