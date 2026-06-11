import { inject, injectable } from "tsyringe";
import {
  CLIENT_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../../data-access/tokens.ts";
import type { ClientRepository } from "../../data-access/repositories/ClientRepository.ts";
import type {
  Project,
  ProjectRepository,
  ProjectStatus,
} from "../../data-access/repositories/ProjectRepository.ts";
import { ServiceError } from "../errors.ts";
import type {
  CreateProjectInput,
  ProjectService,
  ProjectView,
  UpdateProjectInput,
} from "./ProjectService.ts";

/**
 * Legal status transitions. The service is the single source of truth for which
 * moves are allowed; the UI only hints at them. `completed` is terminal, and a
 * `lost` bid can be revived back into estimating.
 */
const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  lead: ["estimating", "lost"],
  estimating: ["won", "lost"],
  won: ["in_progress", "lost"],
  in_progress: ["completed"],
  completed: [],
  lost: ["estimating"],
};

/**
 * Project business rules: validate the referenced client exists in the org,
 * enforce the status state machine, and enrich projects with their client's
 * name. Depends on both repositories — genuinely orchestrating, not a
 * passthrough.
 */
@injectable()
export class ProjectServiceImpl implements ProjectService {
  constructor(
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
    @inject(CLIENT_REPOSITORY_TOKEN)
    private readonly clients: ClientRepository,
  ) {}

  async list(orgId: string): Promise<ProjectView[]> {
    // One client lookup for the whole list instead of one per project.
    const [projects, clients] = await Promise.all([
      this.projects.findByOrg(orgId),
      this.clients.findByOrg(orgId),
    ]);
    const nameById = new Map(clients.map((client) => [client.id, client.name]));
    return projects.map((project) => ({
      ...project,
      clientName: nameById.get(project.clientId) ?? null,
    }));
  }

  async get(orgId: string, id: string): Promise<ProjectView | null> {
    const project = await this.projects.findById(orgId, id);
    return project ? this.toView(orgId, project) : null;
  }

  async create(orgId: string, input: CreateProjectInput): Promise<ProjectView> {
    // Cross-aggregate invariant: a project must point at a real client here.
    const client = await this.clients.findById(orgId, input.clientId);
    if (!client) {
      throw new ServiceError("BAD_REQUEST", "Selected client does not exist");
    }
    const project = await this.projects.create(orgId, {
      name: input.name,
      location: input.location,
      clientId: input.clientId,
      description: input.description,
      status: "lead",
    });
    return { ...project, clientName: client.name };
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateProjectInput,
  ): Promise<ProjectView> {
    const project = await this.projects.update(orgId, id, input);
    if (!project) {
      throw new ServiceError("NOT_FOUND", "Project not found");
    }
    return this.toView(orgId, project);
  }

  async changeStatus(
    orgId: string,
    id: string,
    status: ProjectStatus,
  ): Promise<ProjectView> {
    const project = await this.projects.findById(orgId, id);
    if (!project) {
      throw new ServiceError("NOT_FOUND", "Project not found");
    }
    if (project.status === status) {
      return this.toView(orgId, project);
    }
    if (!ALLOWED_TRANSITIONS[project.status].includes(status)) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Cannot move a ${project.status} project to ${status}`,
      );
    }
    const updated = await this.projects.update(orgId, id, { status });
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Project not found");
    }
    return this.toView(orgId, updated);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.projects.deleteById(orgId, id);
  }

  private async toView(orgId: string, project: Project): Promise<ProjectView> {
    const client = await this.clients.findById(orgId, project.clientId);
    return { ...project, clientName: client?.name ?? null };
  }
}
