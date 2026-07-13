import type {
  Project,
  ProjectStatus,
} from "@landscape/domain";

export type { Project, ProjectStatus };

/** A project plus its client's display name, resolved at read time. */
export interface ProjectView extends Project {
  clientName: string | null;
}

export interface CreateProjectInput {
  name: string;
  location: string | null;
  clientId: string;
  description: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  location?: string | null;
  description?: string | null;
}

/** A rendered property image, ready to drop straight into an <img src>. */
export interface PropertyImage {
  dataUrl: string;
}

export interface ProjectService {
  list(orgId: string): Promise<ProjectView[]>;
  get(orgId: string, id: string): Promise<ProjectView | null>;
  create(orgId: string, input: CreateProjectInput): Promise<ProjectView>;
  update(orgId: string, id: string, input: UpdateProjectInput): Promise<ProjectView>;
  changeStatus(
    orgId: string,
    id: string,
    status: ProjectStatus,
  ): Promise<ProjectView>;
  remove(orgId: string, id: string): Promise<void>;
  /**
   * Aerial image of the project's property, or null when the project has no
   * location set or the provider can't locate the address.
   */
  getPropertyImage(orgId: string, id: string): Promise<PropertyImage | null>;
}
