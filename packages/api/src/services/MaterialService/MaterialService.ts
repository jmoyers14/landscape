import type { Material, MaterialInput } from "@landscape/domain";

export type { Material, MaterialInput };

/**
 * Material catalog business logic: normalizes input on write and protects
 * referential integrity — a material still referenced by an assembly line can't
 * be deleted.
 */
export interface MaterialService {
  list(orgId: string): Promise<Material[]>;
  get(orgId: string, id: string): Promise<Material | null>;
  create(orgId: string, input: MaterialInput): Promise<Material>;
  update(orgId: string, id: string, input: MaterialInput): Promise<Material>;
  remove(orgId: string, id: string): Promise<void>;
}
