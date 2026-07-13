import type { Assembly } from "@landscape/domain";

// The Assembly entity (and its driver/line shapes) is a shared domain type the
// engine generates from, so it lives in @landscape/domain. The persistence-shaped
// derivations stay here at the data-access boundary.
export type {
  Assembly,
  AssemblyDriver,
  AssemblyLine,
  AssemblyLineKind,
  AssemblySource,
  AssemblyTask,
  LaborAssemblyLine,
  MaterialAssemblyLine,
} from "@landscape/domain";

/** Persisted fields for a new assembly — everything but server-managed id/createdAt. */
export type AssemblyInput = Omit<Assembly, "id" | "createdAt">;

/** Partial set of persisted fields for an update. */
export type AssemblyChanges = Partial<AssemblyInput>;
