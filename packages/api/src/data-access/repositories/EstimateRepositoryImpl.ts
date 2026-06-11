import mongoose from "mongoose";
import { injectable } from "tsyringe";
import { EstimateModel } from "../models/Estimate.ts";
import type {
  Estimate,
  EstimateMetaChanges,
  EstimateRepository,
  EstimateStatus,
  LineItem,
  LineItemInput,
  LineItemType,
  NewEstimate,
} from "./EstimateRepository.ts";

type LineItemDoc = {
  _id: unknown;
  phase: string | null;
  type: LineItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
};

type EstimateDoc = {
  _id: unknown;
  projectId: string;
  title: string;
  status: EstimateStatus;
  overheadRate: number;
  profitRate: number;
  taxRate: number;
  lineItems: LineItemDoc[];
  createdAt: Date;
};

/**
 * Mongoose-backed EstimateRepository. Line-item edits use array update
 * operators (rather than hydrated subdocuments) so reads stay lean and the
 * mapping to plain entities is straightforward. Every query is org-scoped.
 */
@injectable()
export class EstimateRepositoryImpl implements EstimateRepository {
  async findByProject(orgId: string, projectId: string): Promise<Estimate[]> {
    const docs = await EstimateModel.find({ orgId, projectId })
      .sort({ createdAt: -1 })
      .lean<EstimateDoc[]>();
    return docs.map(toEstimate);
  }

  async findById(orgId: string, id: string): Promise<Estimate | null> {
    const doc = await EstimateModel.findOne({ _id: id, orgId }).lean<EstimateDoc | null>();
    return doc ? toEstimate(doc) : null;
  }

  async create(orgId: string, data: NewEstimate): Promise<Estimate> {
    const doc = await EstimateModel.create({ orgId, ...data, lineItems: [] });
    return toEstimate(doc.toObject() as EstimateDoc);
  }

  async updateMeta(
    orgId: string,
    id: string,
    changes: EstimateMetaChanges,
  ): Promise<Estimate | null> {
    const doc = await EstimateModel.findOneAndUpdate({ _id: id, orgId }, changes, {
      new: true,
    }).lean<EstimateDoc | null>();
    return doc ? toEstimate(doc) : null;
  }

  async addLineItem(
    orgId: string,
    id: string,
    item: LineItemInput,
  ): Promise<Estimate | null> {
    const _id = new mongoose.Types.ObjectId();
    const doc = await EstimateModel.findOneAndUpdate(
      { _id: id, orgId },
      { $push: { lineItems: { _id, ...item } } },
      { new: true },
    ).lean<EstimateDoc | null>();
    return doc ? toEstimate(doc) : null;
  }

  async updateLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
    item: LineItemInput,
  ): Promise<Estimate | null> {
    const itemId = new mongoose.Types.ObjectId(lineItemId);
    const doc = await EstimateModel.findOneAndUpdate(
      { _id: id, orgId },
      { $set: { "lineItems.$[el]": { _id: itemId, ...item } } },
      { new: true, arrayFilters: [{ "el._id": itemId }] },
    ).lean<EstimateDoc | null>();
    return doc ? toEstimate(doc) : null;
  }

  async removeLineItem(
    orgId: string,
    id: string,
    lineItemId: string,
  ): Promise<Estimate | null> {
    const doc = await EstimateModel.findOneAndUpdate(
      { _id: id, orgId },
      { $pull: { lineItems: { _id: new mongoose.Types.ObjectId(lineItemId) } } },
      { new: true },
    ).lean<EstimateDoc | null>();
    return doc ? toEstimate(doc) : null;
  }

  async deleteById(orgId: string, id: string): Promise<void> {
    await EstimateModel.deleteOne({ _id: id, orgId });
  }
}

function toLineItem(doc: LineItemDoc): LineItem {
  return {
    id: String(doc._id),
    phase: doc.phase ?? null,
    type: doc.type,
    description: doc.description,
    quantity: doc.quantity,
    unit: doc.unit ?? null,
    unitPrice: doc.unitPrice,
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
    lineItems: (doc.lineItems ?? []).map(toLineItem),
    createdAt: doc.createdAt.toISOString(),
  };
}
