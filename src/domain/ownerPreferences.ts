export type LanguageCode = "HU" | "EN" | "DE";
export type ThemeMode = "LIGHT" | "DARK";

export interface OwnerPreferences {
  ownerPartitionId: string;
  language: LanguageCode;
  theme: ThemeMode;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerPreferencesRepository {
  load(ownerPartitionId: string): Promise<OwnerPreferences | null>;
  save(preferences: OwnerPreferences, expectedRevision: number | null): Promise<void>;
}

export class OwnerPreferencesOwnershipError extends Error {}
export class OwnerPreferencesRevisionConflictError extends Error {}
export class OwnerPreferencesAlreadyExistsError extends Error {}
export class OwnerPreferencesNotFoundError extends Error {}

export const DEFAULT_LANGUAGE: LanguageCode = "EN";
export const DEFAULT_THEME: ThemeMode = "LIGHT";

export function createDefaultOwnerPreferences(
  ownerPartitionId: string,
  now: string,
): OwnerPreferences {
  if (!ownerPartitionId.trim()) {
    throw new OwnerPreferencesOwnershipError("Owner partition id is required.");
  }

  return {
    ownerPartitionId,
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function validateOwnerPreferences(preferences: OwnerPreferences): void {
  if (!preferences.ownerPartitionId.trim()) {
    throw new OwnerPreferencesOwnershipError("Owner partition id is required.");
  }
  if (!["HU", "EN", "DE"].includes(preferences.language)) {
    throw new Error("Unsupported language preference.");
  }
  if (!["LIGHT", "DARK"].includes(preferences.theme)) {
    throw new Error("Unsupported theme preference.");
  }
  if (!Number.isInteger(preferences.revision) || preferences.revision <= 0) {
    throw new OwnerPreferencesRevisionConflictError(
      "Owner preference revision must be a positive integer.",
    );
  }
}

export function assertOwnerPreferencesRevisionTransition(
  current: OwnerPreferences | null,
  next: OwnerPreferences,
  expectedRevision: number | null,
): void {
  if (current && current.ownerPartitionId !== next.ownerPartitionId) {
    throw new OwnerPreferencesOwnershipError(
      "Owner preference record cannot change ownership.",
    );
  }

  if (expectedRevision === null) {
    if (current) {
      throw new OwnerPreferencesAlreadyExistsError("Owner preferences already exist.");
    }
    if (next.revision !== 1) {
      throw new OwnerPreferencesRevisionConflictError(
        "New owner preferences must start at revision 1.",
      );
    }
    return;
  }

  if (!current) {
    throw new OwnerPreferencesNotFoundError("Owner preferences were not found.");
  }
  if (current.revision !== expectedRevision) {
    throw new OwnerPreferencesRevisionConflictError(
      "Persisted owner preference revision does not match expectedRevision.",
    );
  }
  if (next.revision !== expectedRevision + 1) {
    throw new OwnerPreferencesRevisionConflictError(
      "Next owner preference revision must increment exactly by one.",
    );
  }
}
