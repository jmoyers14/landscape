import type { MaterialRepository } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { AssemblyRepository } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettingsRepository } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import {
  DRAINAGE_MATERIALS,
  DRAINAGE_PRICING,
  buildDrainageAssembly,
} from "./drainage.ts";

export interface SeedDeps {
  materials: MaterialRepository;
  assemblies: AssemblyRepository;
  pricingSettings: PricingSettingsRepository;
}

/**
 * Populates an org with the starter catalog (currently just Drainage). Inserts
 * materials first to capture their database-assigned ids, then builds the
 * assembly around them. Uses repositories directly (not the services) so it can
 * stamp the assembly `source: "starter"`, which the services force to "custom".
 */
export async function seedOrg(orgId: string, deps: SeedDeps): Promise<void> {
  await deps.pricingSettings.upsert(orgId, DRAINAGE_PRICING);

  const materialIdBySlug: Record<string, string> = {};
  for (const { slug, input } of DRAINAGE_MATERIALS) {
    const created = await deps.materials.create(orgId, input);
    materialIdBySlug[slug] = created.id;
  }

  await deps.assemblies.create(orgId, buildDrainageAssembly(materialIdBySlug));
}
