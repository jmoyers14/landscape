import { injectable } from "tsyringe";
import { AssemblyModel, type AssemblyDoc } from "../../models/Assembly.ts";
import type {
  Assembly,
  AssemblyChanges,
  AssemblyInput,
  AssemblyLine,
  AssemblyRepository,
} from "./AssemblyRepository.ts";

/** Mongoose-backed assembly recipes. Every query is org-scoped. */
@injectable()
export class AssemblyRepositoryImpl implements AssemblyRepository {
  async findByOrg(orgId: string): Promise<Assembly[]> {
    const docs = await AssemblyModel.find({ orgId }).sort({ sortOrder: 1 }).lean();
    return docs.map(toAssembly);
  }

  async findById(orgId: string, id: string): Promise<Assembly | null> {
    const doc = await AssemblyModel.findOne({ _id: id, orgId }).lean();
    return doc ? toAssembly(doc) : null;
  }

  async create(orgId: string, data: AssemblyInput): Promise<Assembly> {
    const doc = await AssemblyModel.create({ orgId, ...data });
    return toAssembly(doc.toObject());
  }

  async update(
    orgId: string,
    id: string,
    changes: AssemblyChanges,
  ): Promise<Assembly | null> {
    const doc = await AssemblyModel.findOneAndUpdate({ _id: id, orgId }, changes, {
      new: true,
    }).lean();
    return doc ? toAssembly(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await AssemblyModel.deleteOne({ _id: id, orgId });
  }
}

function toAssembly(doc: AssemblyDoc): Assembly {
  return {
    id: String(doc._id),
    name: doc.name,
    category: doc.category,
    description: doc.description ?? null,
    sortOrder: doc.sortOrder,
    active: doc.active,
    drivers: (doc.drivers ?? []).map((d) => ({
      key: d.key,
      label: d.label,
      unit: d.unit,
      defaultValue: d.defaultValue,
    })),
    lines: (doc.lines ?? []).map(toAssemblyLine),
    createdAt: doc.createdAt.toISOString(),
  };
}

// Narrows the flat persisted line (every field nullable) into the domain union.
// A malformed line missing its id/key maps to "" — the generator then surfaces
// a clear "unknown material/labor rate" error rather than a null crash.
function toAssemblyLine(l: AssemblyDoc["lines"][number]): AssemblyLine {
  const base = {
    key: l.key,
    description: l.description,
    quantityFormula: l.quantityFormula,
    sortOrder: l.sortOrder,
  };
  if (l.kind === "labor") {
    return { ...base, kind: "labor", laborRateKey: l.laborRateKey ?? "" };
  }
  return {
    ...base,
    kind: "material",
    materialId: l.materialId ?? "",
    deliveriesFormula: l.deliveriesFormula ?? null,
  };
}
