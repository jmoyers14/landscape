// PricingSettings (and its labor-rate rows) are shared domain types the engine's
// cost buildup reads, so they live in @landscape/domain. There are no persistence
// derivations beyond the entity itself.
export type { LaborRate, PricingSettings } from "@landscape/domain";
