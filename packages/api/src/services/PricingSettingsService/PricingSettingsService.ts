import type {
  LaborRate,
  PricingSettings,
} from "../../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";

export type { LaborRate, PricingSettings };

/**
 * Pricing settings business logic. `get` always resolves to a usable settings
 * object (falling back to defaults before the org has configured anything);
 * `update` validates the rates and labor table before persisting.
 */
export interface PricingSettingsService {
  get(orgId: string): Promise<PricingSettings>;
  update(orgId: string, input: PricingSettings): Promise<PricingSettings>;
}
