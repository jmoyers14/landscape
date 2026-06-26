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
  // The seed is a re-runnable dev tool, so start from a clean slate. Without
  // this, `create` appends and re-running duplicates the whole catalog.
  // (PricingSettings is a per-org singleton, so its upsert is already
  // idempotent and needs no clearing.)
  await clearCatalog(orgId, deps);

  await deps.pricingSettings.upsert(orgId, DRAINAGE_PRICING);

  const materialIdBySlug: Record<string, string> = {};
  for (const { slug, input } of DRAINAGE_MATERIALS) {
    const created = await deps.materials.create(orgId, input);
    materialIdBySlug[slug] = created.id;
  }

  await deps.assemblies.create(orgId, buildDrainageAssembly(materialIdBySlug));
}

async function clearCatalog(orgId: string, deps: SeedDeps): Promise<void> {
  // Assemblies reference materials, so remove the assemblies first.
  const assemblies = await deps.assemblies.findByOrg(orgId);
  for (const assembly of assemblies) {
    await deps.assemblies.deleteById(orgId, assembly.id);
  }

  const materials = await deps.materials.findByOrg(orgId);
  for (const material of materials) {
    await deps.materials.deleteById(orgId, material.id);
  }
}
