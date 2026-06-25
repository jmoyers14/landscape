import { injectable } from "tsyringe";
import { MaterialModel, type MaterialDoc } from "../../models/Material.ts";
import type {
  Material,
  MaterialChanges,
  MaterialInput,
  MaterialRepository,
} from "./MaterialRepository.ts";

/** Mongoose-backed material catalog. Every query is org-scoped. */
@injectable()
export class MaterialRepositoryImpl implements MaterialRepository {
  async findByOrg(orgId: string): Promise<Material[]> {
    const docs = await MaterialModel.find({ orgId })
      .sort({ category: 1, name: 1 })
      .lean();
    return docs.map(toMaterial);
  }

  async findById(orgId: string, id: string): Promise<Material | null> {
    const doc = await MaterialModel.findOne({ _id: id, orgId }).lean();
    return doc ? toMaterial(doc) : null;
  }

  async findByIds(orgId: string, ids: string[]): Promise<Material[]> {
    if (ids.length === 0) return [];
    const docs = await MaterialModel.find({ orgId, _id: { $in: ids } }).lean();
    return docs.map(toMaterial);
  }

  async create(orgId: string, data: MaterialInput): Promise<Material> {
    const doc = await MaterialModel.create({ orgId, ...data });
    return toMaterial(doc.toObject());
  }

  async update(
    orgId: string,
    id: string,
    changes: MaterialChanges,
  ): Promise<Material | null> {
    const doc = await MaterialModel.findOneAndUpdate({ _id: id, orgId }, changes, {
      new: true,
    }).lean();
    return doc ? toMaterial(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await MaterialModel.deleteOne({ _id: id, orgId });
  }
}

function toMaterial(doc: MaterialDoc): Material {
  return {
    id: String(doc._id),
    name: doc.name,
    category: doc.category,
    unit: doc.unit,
    unitPrice: doc.unitPrice,
    deliveryCost: doc.deliveryCost,
    taxable: doc.taxable,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
  };
}
