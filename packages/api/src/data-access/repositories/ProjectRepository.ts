export type ProjectStatus =
  | "lead"
  | "estimating"
  | "won"
  | "lost"
  | "in_progress"
  | "completed";

/**
 * Project entity — plain data, free of Mongoose types. References its client by
 * id; resolving the client's name is a read-time concern handled in the service.
 */
export interface Project {
  id: string;
  name: string;
  location: string | null;
  clientId: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
}

/** Persisted fields for a new project (status included; service sets it). */
export type NewProject = Omit<Project, "id" | "createdAt">;

/** Partial set of persisted fields for an update. */
export type ProjectChanges = Partial<NewProject>;

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
