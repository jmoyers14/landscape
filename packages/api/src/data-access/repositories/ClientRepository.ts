/**
 * Client entity — plain data, free of Mongoose types. The repository maps
 * documents to this shape so nothing driver-related leaks past the boundary.
 */
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

/** Fields accepted when creating or replacing a client. */
export interface ClientInput {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

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
