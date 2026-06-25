import { inject, injectable } from "tsyringe";
import {
  CLIENT_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "../../data-access/tokens.ts";
import type {
  Client,
  ClientInput,
  ClientRepository,
} from "../../data-access/repositories/ClientRepository/ClientRepository.ts";
import type { ProjectRepository } from "../../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import { ServiceError } from "../errors.ts";
import type { ClientService } from "./ClientService.ts";

/**
 * Client business rules: normalize contact details, keep email unique within an
 * org, and protect referential integrity (a client with projects can't be
 * deleted). It orchestrates two repositories to do so — not a passthrough.
 */
@injectable()
export class ClientServiceImpl implements ClientService {
  constructor(
    @inject(CLIENT_REPOSITORY_TOKEN)
    private readonly clients: ClientRepository,
    @inject(PROJECT_REPOSITORY_TOKEN)
    private readonly projects: ProjectRepository,
  ) {}

  list(orgId: string): Promise<Client[]> {
    return this.clients.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Client | null> {
    return this.clients.findById(orgId, id);
  }

  async create(orgId: string, input: ClientInput): Promise<Client> {
    const data = normalize(input);
    await this.assertEmailAvailable(orgId, data.email, null);
    return this.clients.create(orgId, data);
  }

  async update(orgId: string, id: string, input: ClientInput): Promise<Client> {
    const data = normalize(input);
    await this.assertEmailAvailable(orgId, data.email, id);
    const updated = await this.clients.update(orgId, id, data);
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Client not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    const projectCount = await this.projects.countByClient(orgId, id);
    if (projectCount > 0) {
      throw new ServiceError(
        "CONFLICT",
        `Client has ${projectCount} project(s); reassign or delete them first`,
      );
    }
    await this.clients.deleteById(orgId, id);
  }

  // A client's email, when present, must be unique within the org. excludeId
  // lets an update keep its own email without colliding with itself.
  private async assertEmailAvailable(
    orgId: string,
    email: string | null,
    excludeId: string | null,
  ): Promise<void> {
    if (!email) {
      return;
    }
    const existing = await this.clients.findByEmail(orgId, email);
    if (existing && existing.id !== excludeId) {
      throw new ServiceError(
        "CONFLICT",
        `A client with email ${email} already exists`,
      );
    }
  }
}

function normalize(input: ClientInput): ClientInput {
  const clean = (value: string | null): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    name: input.name.trim(),
    email: clean(input.email)?.toLowerCase() ?? null,
    phone: clean(input.phone),
    address: clean(input.address),
  };
}
