import mongoose from "mongoose";
import { injectable } from "tsyringe";
import { EstimateModel, type EstimateDoc } from "../../models/Estimate.ts";
import type {
  Estimate,
  EstimateAssembly,
  EstimateMetaChanges,
  EstimateRepository,
  EstimateSnapshot,
  LineItem,
  NewEstimate,
} from "./EstimateRepository.ts";

/**
 * Mongoose-backed EstimateRepository. The line-item snapshot is replaced as a
 * whole on (re)generation rather than mutated piecemeal. Every query is
 * org-scoped.
 */
@injectable()
export class EstimateRepositoryImpl implements EstimateRepository {
  async findByProject(orgId: string, projectId: string): Promise<Estimate[]> {
    const docs = await EstimateModel.find({ orgId, projectId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map(toEstimate);
  }

  async findById(orgId: string, id: string): Promise<Estimate | null> {
    const doc = await EstimateModel.findOne({ _id: id, orgId }).lean();
    return doc ? toEstimate(doc) : null;
  }

  async create(orgId: string, data: NewEstimate): Promise<Estimate> {
    const doc = await EstimateModel.create({
      orgId,
      ...data,
      assemblies: [],
      lineItems: [],
    });
    return toEstimate(doc.toObject());
  }

  async updateMeta(
    orgId: string,
    id: string,
    changes: EstimateMetaChanges,
  ): Promise<Estimate | null> {
    const doc = await EstimateModel.findOneAndUpdate({ _id: id, orgId }, changes, {
      returnDocument: "after",
    }).lean();
    return doc ? toEstimate(doc) : null;
  }

  async replaceSnapshot(
    orgId: string,
    id: string,
    snapshot: EstimateSnapshot,
  ): Promise<Estimate | null> {
    const lineItems = snapshot.lineItems.map((item) => ({
      _id: new mongoose.Types.ObjectId(),
      ...item,
    }));
    const doc = await EstimateModel.findOneAndUpdate(
      { _id: id, orgId },
      {
        $set: {
          assemblies: snapshot.assemblies,
          lineItems,
          overheadRate: snapshot.overheadRate,
          profitRate: snapshot.profitRate,
          taxRate: snapshot.taxRate,
        },
      },
      { returnDocument: "after" },
    ).lean();
    return doc ? toEstimate(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await EstimateModel.deleteOne({ _id: id, orgId });
  }
}

function toLineItem(doc: EstimateDoc["lineItems"][number]): LineItem {
  return {
    id: String(doc._id),
    phase: doc.phase ?? null,
    type: doc.type,
    description: doc.description,
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    unitPrice: doc.unitPrice,
    taxable: doc.taxable,
    deliveryCost: doc.deliveryCost,
    quantityFormula: doc.quantityFormula,
    sourceAssemblyId: doc.sourceAssemblyId ?? null,
    sourceLineKey: doc.sourceLineKey ?? null,
  };
}

function toEstimateAssembly(
  doc: EstimateDoc["assemblies"][number],
): EstimateAssembly {
  return {
    assemblyId: doc.assemblyId,
    name: doc.name,
    // driverValues is a Mixed map; it round-trips as a plain object.
    driverValues: (doc.driverValues ?? {}) as Record<string, number>,
  };
}

function toEstimate(doc: EstimateDoc): Estimate {
  return {
    id: String(doc._id),
    projectId: doc.projectId,
    title: doc.title,
    status: doc.status,
    overheadRate: doc.overheadRate,
    profitRate: doc.profitRate,
    taxRate: doc.taxRate,
    assemblies: (doc.assemblies ?? []).map(toEstimateAssembly),
    lineItems: (doc.lineItems ?? []).map(toLineItem),
    createdAt: doc.createdAt.toISOString(),
  };
}
