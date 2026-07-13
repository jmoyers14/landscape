// The Material entity and its persistence-input shapes are part of the app's
// domain model, so they live in @landscape/domain. Re-exported here so the
// repository layer keeps importing them locally.
export type { Material, MaterialInput, MaterialChanges } from "@landscape/domain";
