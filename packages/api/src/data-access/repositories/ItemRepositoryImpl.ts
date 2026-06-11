import { injectable } from "tsyringe";
import { ItemModel, type ItemDocument } from "../models/Item.ts";
import type { Item, ItemRepository } from "./ItemRepository.ts";

type ItemDoc = ItemDocument & { _id: unknown; createdAt: Date };

/**
 * Mongoose-backed ItemRepository. This is the only file that knows items are
 * stored in MongoDB; it maps documents to the plain Item entity on the way out
 * so the Mongoose types never escape. Every method filters by `orgId`, so a
 * resolver can never read or mutate another org's data.
 */
@injectable()
export class ItemRepositoryImpl implements ItemRepository {
  async findByOrg(orgId: string): Promise<Item[]> {
    const docs = await ItemModel.find({ orgId })
      .sort({ createdAt: -1 })
      .lean<ItemDoc[]>();
    return docs.map(toItem);
  }

  async create(orgId: string, name: string): Promise<Item> {
    const doc = await ItemModel.create({ orgId, name });
    return toItem(doc.toObject() as ItemDoc);
  }

  async deleteByOrg(orgId: string, id: string): Promise<void> {
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
