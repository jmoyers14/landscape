import type { Material, MaterialChanges, MaterialInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the material catalog, org-scoped throughout.
 * `findByIds` exists for estimate generation, which resolves every material a
 * set of assemblies references in a single read.
 */
export interface MaterialRepository {
  findByOrg(orgId: string): Promise<Material[]>;
  findById(orgId: string, id: string): Promise<Material | null>;
  findByIds(orgId: string, ids: string[]): Promise<Material[]>;
  create(orgId: string, data: MaterialInput): Promise<Material>;
  update(orgId: string, id: string, changes: MaterialChanges): Promise<Material | null>;
  deleteById(orgId: string, id: string): Promise<void>;
  /**
   * Create-or-update the starter material identified by `seedKey` within the
   * org. Matches on (orgId, seedKey): converges an existing seeded row to
   * `data`, or creates it. This is how SeedService stays idempotent — re-seeding
   * updates in place rather than duplicating — and it never touches custom rows
   * (those have no seedKey). `seedKey` is a persistence-only identity and never
   * appears on the returned Material.
   */
  upsertBySeedKey(
    orgId: string,
    seedKey: string,
    data: MaterialInput,
  ): Promise<Material>;
}
