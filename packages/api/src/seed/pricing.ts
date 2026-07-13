import type { PricingSettings } from "@landscape/platform";

/**
 * The starter pricing settings seeded for a new org, transcribed from the
 * workbook: 7.75% sales tax, margin-basis overhead of 40% (the sheet's
 * `cost / 0.6`), 15% profit, and the two labor rates the Package sheet uses
 * ($35 general, $55 skilled — the $55 lines are concrete/masonry).
 */
export const STARTER_PRICING: PricingSettings = {
  taxRate: 7.75,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
};
