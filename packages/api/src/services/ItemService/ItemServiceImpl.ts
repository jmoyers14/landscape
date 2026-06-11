import { inject, injectable } from "tsyringe";
import { ITEM_REPOSITORY_TOKEN } from "../../data-access/tokens.ts";
import type { ItemRepository } from "../../data-access/repositories/ItemRepository.ts";
import type { Item, ItemService } from "./ItemService.ts";

/**
 * Item business logic. Persistence is delegated to ItemRepository, so this
 * layer stays free of Mongoose. Today the methods are thin passthroughs, but
 * validation and cross-entity rules will grow here without touching the data
 * layer — that separation is the whole point of the seam.
 */
@injectable()
export class ItemServiceImpl implements ItemService {
  constructor(
    @inject(ITEM_REPOSITORY_TOKEN)
    private readonly items: ItemRepository,
  ) {}

  list(orgId: string): Promise<Item[]> {
    return this.items.findByOrg(orgId);
  }

  create(orgId: string, name: string): Promise<Item> {
    return this.items.create(orgId, name);
  }

  remove(orgId: string, id: string): Promise<void> {
    return this.items.deleteByOrg(orgId, id);
  }
}
