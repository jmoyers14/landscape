import type { NewProject, Project, ProjectChanges } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for projects. Org-scoped throughout. `countByClient`
 * exists so a service can enforce referential integrity before deleting a
 * client.
 */
export interface ProjectRepository {
  findByOrg(orgId: string): Promise<Project[]>;
  findById(orgId: string, id: string): Promise<Project | null>;
  countByClient(orgId: string, clientId: string): Promise<number>;
  create(orgId: string, data: NewProject): Promise<Project>;
  update(orgId: string, id: string, changes: ProjectChanges): Promise<Project | null>;
  deleteById(orgId: string, id: string): Promise<void>;
}
