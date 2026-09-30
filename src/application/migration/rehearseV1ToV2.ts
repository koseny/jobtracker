import type { CashFlowRepository, CashFlowWorkspace } from "../../domain/cashFlow";
import type { CashFlowWorkspaceV2 } from "../../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../../domain/v2/repositoryV2";
import { validateWorkspaceV2 } from "../../domain/v2/validationV2";
import { createLegacyWorkspaceBackup, restoreLegacyWorkspaceBackup } from "./legacyBackup";
import { migrateWorkspaceV1ToV2 } from "./v1ToV2";

export class MigrationRehearsalSourceNotFoundError extends Error {}
export class MigrationRehearsalVerificationError extends Error {}

export interface MigrationRehearsalResult {
  backupJson: string;
  candidate: CashFlowWorkspaceV2;
  persistedCandidate: CashFlowWorkspaceV2;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

function sameStructure(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

export async function rehearseV1ToV2Migration(
  legacyRepository: CashFlowRepository,
  stagingRepository: CashFlowRepositoryV2,
  ownerPartitionId: string,
  workspaceId: string,
  rehearsedAt: string,
): Promise<MigrationRehearsalResult> {
  const source = await legacyRepository.load(ownerPartitionId, workspaceId);
  if (!source) {
    throw new MigrationRehearsalSourceNotFoundError(
      "Legacy workspace was not found for migration rehearsal.",
    );
  }

  const sourceSnapshot: CashFlowWorkspace = structuredClone(source);
  const backupJson = createLegacyWorkspaceBackup(
    source,
    ownerPartitionId,
    rehearsedAt,
  );

  const restoredBackup = restoreLegacyWorkspaceBackup(backupJson, ownerPartitionId);
  if (!sameStructure(restoredBackup, sourceSnapshot)) {
    throw new MigrationRehearsalVerificationError(
      "Serialized backup does not restore to the original legacy workspace.",
    );
  }

  const candidate = migrateWorkspaceV1ToV2(
    source,
    ownerPartitionId,
    rehearsedAt,
  );
  validateWorkspaceV2(candidate);

  await stagingRepository.save(ownerPartitionId, candidate, null);

  const persistedCandidate = await stagingRepository.load(
    ownerPartitionId,
    workspaceId,
  );
  if (!persistedCandidate) {
    throw new MigrationRehearsalVerificationError(
      "Staging repository did not return the migrated candidate.",
    );
  }
  validateWorkspaceV2(persistedCandidate);

  if (!sameStructure(persistedCandidate, candidate)) {
    throw new MigrationRehearsalVerificationError(
      "Persisted v2 rehearsal candidate differs from the validated migration candidate.",
    );
  }

  const sourceAfter = await legacyRepository.load(ownerPartitionId, workspaceId);
  if (!sourceAfter || !sameStructure(sourceAfter, sourceSnapshot)) {
    throw new MigrationRehearsalVerificationError(
      "Legacy source changed during migration rehearsal.",
    );
  }

  return {
    backupJson,
    candidate: structuredClone(candidate),
    persistedCandidate: structuredClone(persistedCandidate),
  };
}
