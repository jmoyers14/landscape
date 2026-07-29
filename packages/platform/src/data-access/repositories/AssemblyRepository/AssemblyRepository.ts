import type { Assembly, AssemblyChanges, AssemblyInput } from "./types.ts";

export * from "./types.ts";

/** Persistence boundary for assemblies, org-scoped throughout. */
export interface AssemblyRepository {
  findByOrg(orgId: string): Promise<Assembly[]>;
  findById(orgId: string, id: string): Promise<Assembly | null>;
  create(orgId: string, data: AssemblyInput): Promise<Assembly>;
  update(orgId: string, id: string, changes: AssemblyChanges): Promise<Assembly | null>;
  deleteById(orgId: string, id: string): Promise<void>;
  /**
   * Create-or-update the starter assembly identified by `seedKey` within the
   * org, matching on (orgId, seedKey). The idempotent counterpart of `create`
   * for the seed path: re-seeding converges the row instead of duplicating it,
   * and custom assemblies (no seedKey) are never touched. `seedKey` is a
   * persistence-only identity and never appears on the returned Assembly.
   */
  upsertBySeedKey(
    orgId: string,
    seedKey: string,
    data: AssemblyInput,
  ): Promise<Assembly>;
}
