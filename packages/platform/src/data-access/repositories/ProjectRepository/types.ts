// The Project entity, its status, and its persistence-input shapes are part of
// the app's domain model (Project crosses the API boundary), so they live in
// @landscape/domain. Re-exported here so the repository layer keeps importing
// them locally.
export type {
  Project,
  ProjectStatus,
  NewProject,
  ProjectChanges,
} from "@landscape/domain";
