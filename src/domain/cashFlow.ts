export type CurrencyCode = "HUF";

export interface CashFlowWorkspace {
  workspaceId: string;
  ownerPartitionId: string;
  schemaVersion: number;
  currency: CurrencyCode;
}

export interface CashFlowRepository {
  load(ownerPartitionId: string, workspaceId: string): Promise<CashFlowWorkspace | null>;
  save(workspace: CashFlowWorkspace): Promise<void>;
}
