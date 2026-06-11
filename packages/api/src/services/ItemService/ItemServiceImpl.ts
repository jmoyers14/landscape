import { injectable } from "tsyringe";
import { ItemModel, type ItemDocument } from "../../models/Item.ts";
import type { Item, ItemService } from "./ItemService.ts";

type ItemDoc = ItemDocument & { _id: unknown; createdAt: Date };

/**
 * Persists items in MongoDB via Mongoose. Every method takes an `orgId` and
 * filters by it, so the tenant boundary is enforced at the data layer — a
 * resolver can never accidentally read or mutate another org's items.
 */
@injectable()
export class ItemServiceImpl implements ItemService {
  async list(orgId: string): Promise<Item[]> {
    const docs = await ItemModel.find({ orgId })
      .sort({ createdAt: -1 })
      .lean<ItemDoc[]>();
    return docs.map(toItem);
  }

  async create(orgId: string, name: string): Promise<Item> {
    const doc = await ItemModel.create({ orgId, name });
    return toItem(doc.toObject() as ItemDoc);
  }

  async remove(orgId: string, id: string): Promise<void> {
    // orgId in the filter prevents deleting another org's item by guessing ids.
    await ItemModel.deleteOne({ _id: id, orgId });
  }
}

function toItem(doc: ItemDoc): Item {
  return {
    id: String(doc._id),
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
  };
}
