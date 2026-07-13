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
