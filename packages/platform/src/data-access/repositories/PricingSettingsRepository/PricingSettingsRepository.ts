import type { PricingSettings } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the per-org pricing settings singleton. `get`
 * returns null before the org has saved any; the service supplies defaults.
 */
export interface PricingSettingsRepository {
  get(orgId: string): Promise<PricingSettings | null>;
  upsert(orgId: string, settings: PricingSettings): Promise<PricingSettings>;
}
