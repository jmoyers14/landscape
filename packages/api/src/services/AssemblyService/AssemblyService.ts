import type {
  Assembly,
  AssemblyInput,
} from "../../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type {
  EstimateTotals,
  GeneratedLineItem,
} from "../../engine/generate.ts";

export type { Assembly };

/** The priced result of running an assembly against driver values; saves nothing. */
export interface AssemblyPreview {
  lineItems: GeneratedLineItem[];
  totals: EstimateTotals;
}

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

  /**
   * Compute the priced line items + totals an assembly produces for the given
   * driver values, reading the catalog through the repositories. Read-only —
   * persists nothing (an Estimate, later, will snapshot this). Driver values
   * default to each driver's `defaultValue` when omitted.
   */
  preview(
    orgId: string,
    assemblyId: string,
    driverValues?: Record<string, number>,
  ): Promise<AssemblyPreview>;
}
