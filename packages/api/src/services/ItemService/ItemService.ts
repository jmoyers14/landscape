/**
 * Client-facing item shape. Defined here (not imported from the Mongoose model)
 * so this interface stays free of runtime/mongoose imports — the web client
 * consumes the AppRouter type through it.
 */
export interface Item {
  id: string;
  name: string;
  createdAt: string;
}

export interface ItemService {
  list(orgId: string): Promise<Item[]>;
  create(orgId: string, name: string): Promise<Item>;
  remove(orgId: string, id: string): Promise<void>;
}
