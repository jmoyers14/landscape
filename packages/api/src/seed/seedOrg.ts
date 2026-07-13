import type { MaterialRepository } from "@landscape/platform";
import type { AssemblyRepository } from "@landscape/platform";
import type { PricingSettingsRepository } from "@landscape/platform";
import { STARTER_PRICING } from "./pricing.ts";
import { STARTER_ASSEMBLIES } from "./catalog.ts";

export interface SeedDeps {
  materials: MaterialRepository;
  assemblies: AssemblyRepository;
  pricingSettings: PricingSettingsRepository;
}

/**
 * Populates an org with the starter catalog (the workbook's Package sheet).
 * Inserts each assembly's materials first to capture their database-assigned
 * ids, then builds the assemblies around them. Uses repositories directly (not
 * the services) so it can stamp `source: "starter"`, which the services force to
 * "custom".
 */
export async function seedOrg(orgId: string, deps: SeedDeps): Promise<void> {
  // The seed is a re-runnable dev tool, so start from a clean slate. Without
  // this, `create` appends and re-running duplicates the whole catalog.
  // (PricingSettings is a per-org singleton, so its upsert is already
  // idempotent and needs no clearing.)
  await clearCatalog(orgId, deps);

  await deps.pricingSettings.upsert(orgId, STARTER_PRICING);

  const materialIdBySlug: Record<string, string> = {};
  for (const assembly of STARTER_ASSEMBLIES) {
    for (const { slug, input } of assembly.materials) {
      const created = await deps.materials.create(orgId, input);
      materialIdBySlug[slug] = created.id;
    }
  }

  for (const assembly of STARTER_ASSEMBLIES) {
    await deps.assemblies.create(orgId, assembly.build(materialIdBySlug));
  }
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
