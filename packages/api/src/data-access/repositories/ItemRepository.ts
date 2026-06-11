/**
 * Domain entity for an item, free of any Mongoose/driver types. The repository
 * maps persistence documents to this plain shape, so nothing mongo-related
 * leaks past the data-access boundary — services, routers, and the web client
 * only ever see this.
 *
 * Defined in the data-access layer (not the service) so dependencies point one
 * direction: services depend on data-access, never the reverse.
 */
export interface Item {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * Persistence boundary for items — one repository per collection. Every method
 * takes an `orgId` and scopes its query by it, so the tenant boundary is
 * enforced here at the data layer and is impossible to forget upstream.
 */
export interface ItemRepository {
  findByOrg(orgId: string): Promise<Item[]>;
  create(orgId: string, name: string): Promise<Item>;
  deleteByOrg(orgId: string, id: string): Promise<void>;
}
