import type { CashFlowWorkspaceV2, TransferMovementRevisionPayload } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface CreateTransferMovementV2Command extends WorkspaceV2CommandContext {
  movementId: string;
  movementRevisionId: string;
  payload: TransferMovementRevisionPayload;
}

/**
 * Create one internal transfer and its first revision in a single save. Both
 * native amounts are supplied, never converted or inferred. Fees, reserve
 * actions, plan links and FX quotes require separate commands.
 */
export async function createTransferMovementV2(
  repository: CashFlowRepositoryV2,
  command: CreateTransferMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  const payload = request.payload;
  if (payload.movementType !== "TRANSFER") {
    throw new DomainV2ValidationError("This command creates only TRANSFER movements.");
  }
  if (!Number.isSafeInteger(payload.sourceAmount.amountMinor) ||
      !Number.isSafeInteger(payload.destinationAmount.amountMinor)) {
    throw new DomainV2ValidationError("Transfer native amounts must be exact safe integers.");
  }
  if (payload.sourceAmount.currencyCode === payload.destinationAmount.currencyCode &&
      payload.sourceAmount.amountMinor !== payload.destinationAmount.amountMinor) {
    throw new DomainV2ValidationError("Same-currency transfer amounts must match; record fees separately.");
  }

  return executeWorkspaceV2Command(repository, request, source => ({
    ...source,
    moneyMovements: [...source.moneyMovements, {
      movementId: request.movementId,
      movementType: "TRANSFER",
      lifecycleStatus: "ACTIVE",
      currentRevisionNo: 1,
      createdAt: request.changedAt,
      updatedAt: request.changedAt,
    }],
    moneyMovementRevisions: [...source.moneyMovementRevisions, {
      movementRevisionId: request.movementRevisionId,
      movementId: request.movementId,
      revisionNo: 1,
      payload: {
        movementType: "TRANSFER",
        occurredOn: payload.occurredOn,
        sourceAccountId: payload.sourceAccountId,
        destinationAccountId: payload.destinationAccountId,
        sourceAmount: { ...payload.sourceAmount },
        destinationAmount: { ...payload.destinationAmount },
        description: payload.description,
      },
      changedAt: request.changedAt,
    }],
  }));
}
