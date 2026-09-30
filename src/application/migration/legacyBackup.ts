import type { CashFlowWorkspace } from "../../domain/cashFlow";
import { migrateWorkspaceV1ToV2 } from "./v1ToV2";

const BACKUP_FORMAT = "civilbonus-hcf-v1-migration-backup";
const BACKUP_FORMAT_VERSION = 1;

type IdentityNeutralLegacyWorkspace = Omit<CashFlowWorkspace, "ownerPartitionId">;

interface LegacyWorkspaceBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  workspace: IdentityNeutralLegacyWorkspace;
}

export class LegacyWorkspaceBackupError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createLegacyWorkspaceBackup(
  source: CashFlowWorkspace,
  activeOwnerPartitionId: string,
  exportedAt: string,
): string {
  if (source.ownerPartitionId !== activeOwnerPartitionId) {
    throw new LegacyWorkspaceBackupError(
      "Legacy workspace does not belong to the active owner partition.",
    );
  }

  // Reuse the migration validator so a backup is never presented as migration-ready
  // if the source itself cannot pass the approved v1 validation boundary.
  migrateWorkspaceV1ToV2(source, activeOwnerPartitionId, exportedAt);

  const { ownerPartitionId: _ownerPartitionId, ...workspace } = structuredClone(source);
  const envelope: LegacyWorkspaceBackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    workspace,
  };

  return JSON.stringify(envelope, null, 2);
}

export function restoreLegacyWorkspaceBackup(
  serialized: string,
  activeOwnerPartitionId: string,
): CashFlowWorkspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new LegacyWorkspaceBackupError("Backup is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new LegacyWorkspaceBackupError("Backup envelope must be an object.");
  }
  if (parsed.format !== BACKUP_FORMAT || parsed.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new LegacyWorkspaceBackupError("Unsupported legacy migration backup format.");
  }
  if (typeof parsed.exportedAt !== "string" || !isRecord(parsed.workspace)) {
    throw new LegacyWorkspaceBackupError("Backup envelope is incomplete.");
  }

  const candidate = {
    ...structuredClone(parsed.workspace),
    ownerPartitionId: activeOwnerPartitionId,
  } as CashFlowWorkspace;

  try {
    migrateWorkspaceV1ToV2(candidate, activeOwnerPartitionId, parsed.exportedAt);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Backup workspace is invalid.";
    throw new LegacyWorkspaceBackupError(message);
  }

  return candidate;
}
