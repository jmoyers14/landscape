// The Assembly entity (and its driver/line shapes) plus its persistence-input
// shapes are part of the app's domain model, so they live in @landscape/domain.
// Re-exported here so the repository layer keeps importing them locally.
export type {
  Assembly,
  AssemblyDriver,
  AssemblyLine,
  AssemblyLineKind,
  AssemblySource,
  AssemblyTask,
  LaborAssemblyLine,
  MaterialAssemblyLine,
  AssemblyInput,
  AssemblyChanges,
} from "@landscape/domain";
