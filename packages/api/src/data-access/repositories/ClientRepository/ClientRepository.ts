import type { Client, ClientInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for clients. Every method is org-scoped so the tenant
 * boundary is enforced at the data layer.
 */
export interface ClientRepository {
  findByOrg(orgId: string): Promise<Client[]>;
  findById(orgId: string, id: string): Promise<Client | null>;
  findByEmail(orgId: string, email: string): Promise<Client | null>;
  create(orgId: string, data: ClientInput): Promise<Client>;
  update(orgId: string, id: string, data: ClientInput): Promise<Client | null>;
  deleteById(orgId: string, id: string): Promise<void>;
}
