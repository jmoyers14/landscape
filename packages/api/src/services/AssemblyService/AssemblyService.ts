import type {
  Assembly,
  AssemblyInput,
} from "../../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";

export type { Assembly };

/**
 * Client-facing input for an assembly: everything an org provides, minus the
 * server-controlled `source` marker (the service sets that — "custom" for
 * in-app authoring, "starter" for the seed).
 */
export type AssemblyServiceInput = Omit<AssemblyInput, "source">;

/**
 * Assembly (recipe) business logic. Create/update validate the recipe before it
 * persists: unique driver/line keys, every formula parses and references only
 * known drivers/lines (no cycles), and every material/labor reference resolves.
 */
export interface AssemblyService {
  list(orgId: string): Promise<Assembly[]>;
  get(orgId: string, id: string): Promise<Assembly | null>;
  create(orgId: string, input: AssemblyServiceInput): Promise<Assembly>;
  update(
    orgId: string,
    id: string,
    input: AssemblyServiceInput,
  ): Promise<Assembly>;
  remove(orgId: string, id: string): Promise<void>;
}
