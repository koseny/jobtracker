import {
  createDefaultOwnerPreferences,
  type LanguageCode,
  type OwnerPreferences,
  type OwnerPreferencesRepository,
  type ThemeMode,
} from "../domain/ownerPreferences";

export async function ensureOwnerPreferences(
  repository: OwnerPreferencesRepository,
  ownerPartitionId: string,
  now: string,
): Promise<OwnerPreferences> {
  const existing = await repository.load(ownerPartitionId);
  if (existing) return existing;

  const created = createDefaultOwnerPreferences(ownerPartitionId, now);
  try {
    await repository.save(created, null);
    return structuredClone(created);
  } catch {
    const concurrentlyCreated = await repository.load(ownerPartitionId);
    if (concurrentlyCreated) return concurrentlyCreated;
    throw new Error("Owner preferences could not be initialized.");
  }
}

export async function updateOwnerPreferences(
  repository: OwnerPreferencesRepository,
  current: OwnerPreferences,
  patch: Partial<Pick<OwnerPreferences, "language" | "theme">>,
  now: string,
): Promise<OwnerPreferences> {
  const next: OwnerPreferences = {
    ...current,
    ...patch,
    revision: current.revision + 1,
    updatedAt: now,
  };

  await repository.save(next, current.revision);
  return structuredClone(next);
}

export function setLanguagePreference(
  repository: OwnerPreferencesRepository,
  current: OwnerPreferences,
  language: LanguageCode,
  now: string,
): Promise<OwnerPreferences> {
  return updateOwnerPreferences(repository, current, { language }, now);
}

export function setThemePreference(
  repository: OwnerPreferencesRepository,
  current: OwnerPreferences,
  theme: ThemeMode,
  now: string,
): Promise<OwnerPreferences> {
  return updateOwnerPreferences(repository, current, { theme }, now);
}
