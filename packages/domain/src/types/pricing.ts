/**
 * A named labor rate (e.g. general $35/hr, skilled $55/hr). Labor lines point
 * at one of these by `key`.
 */
export interface LaborRate {
  key: string;
  label: string;
  rate: number;
}

/**
 * The org's global pricing knobs for the cost buildup. Rates are percentages.
 * `overheadRate` is margin-basis: overhead = cost × (1 / (1 − rate/100) − 1),
 * so 40 reproduces the spreadsheet's `cost / 0.6 − cost`.
 */
export interface PricingSettings {
  taxRate: number;
  overheadRate: number;
  profitRate: number;
  laborRates: LaborRate[];
}
