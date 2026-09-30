import {
  assertOwnerPreferencesRevisionTransition,
  type OwnerPreferences,
  type OwnerPreferencesRepository,
  validateOwnerPreferences,
} from "../../domain/ownerPreferences";

export class InMemoryOwnerPreferencesRepository implements OwnerPreferencesRepository {
  private readonly records = new Map<string, OwnerPreferences>();

  async load(ownerPartitionId: string): Promise<OwnerPreferences | null> {
    const value = this.records.get(ownerPartitionId);
    return value ? structuredClone(value) : null;
  }

  async save(
    preferences: OwnerPreferences,
    expectedRevision: number | null,
  ): Promise<void> {
    validateOwnerPreferences(preferences);
    const current = this.records.get(preferences.ownerPartitionId) ?? null;
    assertOwnerPreferencesRevisionTransition(current, preferences, expectedRevision);
    this.records.set(preferences.ownerPartitionId, structuredClone(preferences));
  }
}
