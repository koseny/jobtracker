import type { CashFlowWorkspaceV2, TransferMovementRevisionPayload } from "../domain/v2/cashFlowV2";
import type { CashFlowRepositoryV2 } from "../domain/v2/repositoryV2";
import { DomainV2ValidationError } from "../domain/v2/validationV2";
import { executeWorkspaceV2Command, type WorkspaceV2CommandContext } from "./executeWorkspaceV2Command";

export interface CorrectTransferMovementV2Command extends WorkspaceV2CommandContext {
  movementId: string;
  movementRevisionId: string;
  payload: TransferMovementRevisionPayload;
}

export class TransferMovementV2CorrectionScopeError extends Error {}

/** Append a complete replacement to an ACTIVE transfer while retaining its identity and audit history. */
export async function correctTransferMovementV2(
  repository: CashFlowRepositoryV2,
  command: CorrectTransferMovementV2Command,
): Promise<CashFlowWorkspaceV2> {
  const request = structuredClone(command);
  const payload = request.payload;
  if (payload.movementType !== "TRANSFER") {
    throw new DomainV2ValidationError("This command corrects only TRANSFER movements.");
  }
  if (!Number.isSafeInteger(payload.sourceAmount.amountMinor) ||
      !Number.isSafeInteger(payload.destinationAmount.amountMinor)) {
    throw new DomainV2ValidationError("Transfer native amounts must be exact safe integers.");
  }
  if (payload.sourceAmount.currencyCode === payload.destinationAmount.currencyCode &&
      payload.sourceAmount.amountMinor !== payload.destinationAmount.amountMinor) {
    throw new DomainV2ValidationError("Same-currency transfer amounts must match; record fees separately.");
  }

  return executeWorkspaceV2Command(repository, request, source => {
    const movement = source.moneyMovements.find(value => value.movementId === request.movementId);
    if (!movement) throw new DomainV2ValidationError("Movement to correct must exist.");
    if (movement.lifecycleStatus !== "ACTIVE" || movement.movementType !== "TRANSFER") {
      throw new TransferMovementV2CorrectionScopeError("Only ACTIVE TRANSFER correction is supported.");
    }
    if (source.planRealizations.some(value => value.movementId === movement.movementId) ||
        source.allocationEvents.some(value => value.movementId === movement.movementId)) {
      throw new TransferMovementV2CorrectionScopeError("Financially linked transfer correction requires separate dependency resolution.");
    }
    const revisionNo = movement.currentRevisionNo + 1;
    if (!Number.isSafeInteger(movement.currentRevisionNo) || !Number.isSafeInteger(revisionNo)) {
      throw new DomainV2ValidationError("Movement revision must allow an exact increment.");
    }
    return {
      ...source,
      moneyMovements: source.moneyMovements.map(value => value.movementId === movement.movementId
        ? { ...value, currentRevisionNo: revisionNo, updatedAt: request.changedAt }
        : value),
      moneyMovementRevisions: [...source.moneyMovementRevisions, {
        movementRevisionId: request.movementRevisionId,
        movementId: movement.movementId,
        revisionNo,
        payload: {
          movementType: "TRANSFER" as const,
          occurredOn: payload.occurredOn,
          sourceAccountId: payload.sourceAccountId,
          destinationAccountId: payload.destinationAccountId,
          sourceAmount: { ...payload.sourceAmount },
          destinationAmount: { ...payload.destinationAmount },
          description: payload.description,
        },
        changedAt: request.changedAt,
      }],
    };
  });
}
