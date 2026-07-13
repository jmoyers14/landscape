import type { Assembly, AssemblyChanges, AssemblyInput } from "./types.ts";

export * from "./types.ts";

/** Persistence boundary for assemblies, org-scoped throughout. */
export interface AssemblyRepository {
  findByOrg(orgId: string): Promise<Assembly[]>;
  findById(orgId: string, id: string): Promise<Assembly | null>;
  create(orgId: string, data: AssemblyInput): Promise<Assembly>;
  update(orgId: string, id: string, changes: AssemblyChanges): Promise<Assembly | null>;
  deleteById(orgId: string, id: string): Promise<void>;
}
