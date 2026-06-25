import { inject, injectable } from "tsyringe";
import { PRICING_SETTINGS_REPOSITORY_TOKEN } from "../../data-access/tokens.ts";
import type {
  PricingSettings,
  PricingSettingsRepository,
} from "../../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import { ServiceError } from "../errors.ts";
import type { PricingSettingsService } from "./PricingSettingsService.ts";

/**
 * Starter values for an org that hasn't configured pricing yet. Tax defaults to
 * 0 because it's locality-specific; overhead/profit and the labor table mirror
 * the source spreadsheet's conventions and are all editable. `get` returns this
 * until the org saves its own settings.
 */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  taxRate: 0,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
};

/**
 * Owns the rules for an org's pricing knobs: defaults before first save, and
 * validation of every rate + the labor table on update. Rates are percentages.
 */
@injectable()
export class PricingSettingsServiceImpl implements PricingSettingsService {
  constructor(
    @inject(PRICING_SETTINGS_REPOSITORY_TOKEN)
    private readonly settings: PricingSettingsRepository,
  ) {}

  async get(orgId: string): Promise<PricingSettings> {
    const saved = await this.settings.get(orgId);
    return saved ?? DEFAULT_PRICING_SETTINGS;
  }

  async update(orgId: string, input: PricingSettings): Promise<PricingSettings> {
    return this.settings.upsert(orgId, validate(input));
  }
}

// Validates + normalizes settings before persistence. Throws BAD_REQUEST so the
// tRPC boundary surfaces a 400 with the specific reason.
function validate(input: PricingSettings): PricingSettings {
  assertNonNegative("taxRate", input.taxRate);
  assertNonNegative("profitRate", input.profitRate);
  // Overhead is margin-basis (overhead = cost / (1 - rate/100) - cost), so a
  // rate of 100+ would divide by zero or go negative.
  if (
    !Number.isFinite(input.overheadRate) ||
    input.overheadRate < 0 ||
    input.overheadRate >= 100
  ) {
    throw new ServiceError(
      "BAD_REQUEST",
      "overheadRate must be between 0 and 100 (exclusive)",
    );
  }

  const seenKeys = new Set<string>();
  const laborRates = input.laborRates.map((rate) => {
    const key = rate.key.trim();
    if (!key) {
      throw new ServiceError("BAD_REQUEST", "Labor rate key cannot be empty");
    }
    if (seenKeys.has(key)) {
      throw new ServiceError("BAD_REQUEST", `Duplicate labor rate key "${key}"`);
    }
    seenKeys.add(key);
    if (!Number.isFinite(rate.rate) || rate.rate < 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Labor rate "${key}" must be a non-negative number`,
      );
    }
    return { key, label: rate.label.trim(), rate: rate.rate };
  });

  return {
    taxRate: input.taxRate,
    overheadRate: input.overheadRate,
    profitRate: input.profitRate,
    laborRates,
  };
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ServiceError(
      "BAD_REQUEST",
      `${name} must be a non-negative number`,
    );
  }
}
