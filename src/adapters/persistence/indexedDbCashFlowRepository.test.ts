import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("IndexedDbCashFlowRepository architecture contract", () => {
  it("keeps IndexedDB isolated in the persistence adapter", () => {
    const source = readFileSync(new URL("./indexedDbCashFlowRepository.ts", import.meta.url), "utf8");
    expect(source).toContain('const STORE = "workspaces"');
    expect(source).toContain("ownerPartitionId");
    expect(source).toContain("workspaceId");
    expect(source).toContain('db.transaction(STORE, "readwrite")');
  });
});
