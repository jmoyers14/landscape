import type { Material } from "@landscape/domain";

// The Material entity is a shared domain type (the engine prices against it), so
// it lives in @landscape/domain. The persistence-shaped derivations stay here at
// the data-access boundary.
export type { Material } from "@landscape/domain";

/** Persisted fields for a new material — everything but server-managed id/createdAt. */
export type MaterialInput = Omit<Material, "id" | "createdAt">;

/** Partial set of persisted fields for an update. */
export type MaterialChanges = Partial<MaterialInput>;
