/**
 * Material catalog entity — a priced item the estimator draws on (a catch
 * basin, a bag of fertilizer). Plain data, free of Mongoose types. Org-scoped
 * via the repository's `orgId` argument, never a field on the entity.
 */
export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string; // unit of measure: "unit(s)", "ft.", "yds.", "bag(s)"
  unitPrice: number;
  deliveryCost: number; // per-delivery cost; 0 when picked up
  taxable: boolean; // sales tax applies to material lines, not labor
  active: boolean;
  createdAt: string;
}
