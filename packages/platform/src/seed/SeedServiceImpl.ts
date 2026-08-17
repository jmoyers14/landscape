import { inject, injectable } from "tsyringe";
import {
  MATERIAL_REPOSITORY_TOKEN,
  ASSEMBLY_REPOSITORY_TOKEN,
  PRICING_SETTINGS_REPOSITORY_TOKEN,
  COMPANY_PROFILE_REPOSITORY_TOKEN,
} from "../data-access/tokens.ts";
import type { MaterialRepository } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { AssemblyRepository } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettingsRepository } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import type { CompanyProfileRepository } from "../data-access/repositories/CompanyProfileRepository/CompanyProfileRepository.ts";
import type { SeedService } from "./SeedService.ts";
import { STARTER_PRICING } from "./pricing.ts";
import { STARTER_ASSEMBLIES } from "./catalog.ts";

/**
 * Seeds the starter catalog. Talks to the repositories directly (not the api
 * services) because it must stamp seed provenance — `assembly.source: "starter"`
 * and, via the upsert, each row's seed key — which the write services
 * deliberately forbid.
 */
@injectable()
export class SeedServiceImpl implements SeedService {
  constructor(
    @inject(MATERIAL_REPOSITORY_TOKEN)
    private readonly materials: MaterialRepository,
    @inject(ASSEMBLY_REPOSITORY_TOKEN)
    private readonly assemblies: AssemblyRepository,
    @inject(PRICING_SETTINGS_REPOSITORY_TOKEN)
    private readonly pricingSettings: PricingSettingsRepository,
    @inject(COMPANY_PROFILE_REPOSITORY_TOKEN)
    private readonly profiles: CompanyProfileRepository,
  ) {}

  async seedNewOrg(orgId: string, businessName: string): Promise<void> {
    // ensure, not update: a redelivered organization.created must not overwrite
    // a profile the customer has already edited.
    await this.profiles.ensure(orgId, businessName);
    await this.converge(orgId);
  }

  async resetOrgCatalog(orgId: string): Promise<void> {
    // Destructive: dev-only. Clear first so a reset produces exactly the starter
    // catalog with no leftover custom rows — the opposite of seedNewOrg's
    // preserve-custom contract. The company profile is left alone: this clears
    // the catalog, not the business identity.
    await this.clearCatalog(orgId);
    await this.converge(orgId);
  }

  /**
   * The idempotent core, shared by both entry points. Upserts pricing, then
   * every starter material (keyed by its slug), then every assembly (keyed by
   * its seedKey) against the resulting slug→id map.
   *
   * Ordering matters: materials first so their database ids exist before the
   * assemblies that reference them are built. Re-running is safe — each upsert
   * matches its existing row by seed key, so ids stay stable and nothing
   * duplicates. A material deleted between runs is recreated (new id), and the
   * assembly upsert that follows re-resolves the map, so the catalog self-heals.
   */
  private async converge(orgId: string): Promise<void> {
    // PricingSettings is a per-org singleton whose upsert is already idempotent.
    await this.pricingSettings.upsert(orgId, STARTER_PRICING);

    const materialIdBySlug: Record<string, string> = {};
    for (const assembly of STARTER_ASSEMBLIES) {
      for (const { slug, input } of assembly.materials) {
        const material = await this.materials.upsertBySeedKey(
          orgId,
          slug,
          input,
        );
        materialIdBySlug[slug] = material.id;
      }
    }

    for (const assembly of STARTER_ASSEMBLIES) {
      await this.assemblies.upsertBySeedKey(
        orgId,
        assembly.seedKey,
        assembly.build(materialIdBySlug),
      );
    }
  }

  private async clearCatalog(orgId: string): Promise<void> {
    // Assemblies reference materials, so remove the assemblies first.
    const assemblies = await this.assemblies.findByOrg(orgId);
    for (const assembly of assemblies) {
      await this.assemblies.deleteById(orgId, assembly.id);
    }

    const materials = await this.materials.findByOrg(orgId);
    for (const material of materials) {
      await this.materials.deleteById(orgId, material.id);
    }
  }
}
