import type { Assembly } from "@landscape/core";

// The Assembly entity (and its driver/line shapes) is a shared domain type the
// engine generates from, so it lives in @landscape/core. The persistence-shaped
// derivations stay here at the data-access boundary.
export type {
  Assembly,
  AssemblyDriver,
  AssemblyLine,
  AssemblyLineKind,
  AssemblySource,
  LaborAssemblyLine,
  MaterialAssemblyLine,
} from "@landscape/core";

/** Persisted fields for a new assembly — everything but server-managed id/createdAt. */
export type AssemblyInput = Omit<Assembly, "id" | "createdAt">;

/** Partial set of persisted fields for an update. */
export type AssemblyChanges = Partial<AssemblyInput>;
