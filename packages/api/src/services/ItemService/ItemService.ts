import type { Item } from "../../data-access/repositories/ItemRepository.ts";

// The Item entity is owned by the data-access layer (the repository produces
// it). Re-exported here so callers that already import it from the service keep
// working and don't need to know where it's defined.
export type { Item };

export interface ItemService {
  list(orgId: string): Promise<Item[]>;
  create(orgId: string, name: string): Promise<Item>;
  remove(orgId: string, id: string): Promise<void>;
}
