import { describe, expect, it } from "vitest";
import { InMemoryCashFlowRepository } from "../adapters/persistence/inMemoryCashFlowRepository";
import { ensureWorkspace } from "./cashFlowService";

describe("ensureWorkspace", () => {
  it("creates an owner-scoped R1 workspace when none exists", async () => {
    const repository = new InMemoryCashFlowRepository();
    const created = await ensureWorkspace(repository, "owner-a", "home", "2026-09-28T20:00:00.000Z");

    expect(created).toMatchObject({
      workspaceId: "home",
      ownerPartitionId: "owner-a",
      schemaVersion: 1,
      currency: "HUF",
      items: [],
    });
    await expect(repository.load("owner-a", "home")).resolves.toEqual(created);
  });

  it("returns the existing workspace without replacing its source state", async () => {
    const repository = new InMemoryCashFlowRepository();
    const first = await ensureWorkspace(repository, "owner-a", "home", "2026-09-28T20:00:00.000Z");
    const second = await ensureWorkspace(repository, "owner-a", "home", "2026-09-28T21:00:00.000Z");

    expect(second).toEqual(first);
  });

  it("does not expose another owner's workspace with the same id", async () => {
    const repository = new InMemoryCashFlowRepository();
    const ownerA = await ensureWorkspace(repository, "owner-a", "home", "2026-09-28T20:00:00.000Z");
    const ownerB = await ensureWorkspace(repository, "owner-b", "home", "2026-09-28T20:01:00.000Z");

    expect(ownerB.ownerPartitionId).toBe("owner-b");
    expect(ownerB).not.toEqual(ownerA);
    await expect(repository.load("owner-a", "home")).resolves.toEqual(ownerA);
  });
});
