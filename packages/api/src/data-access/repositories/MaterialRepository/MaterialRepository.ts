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
}
