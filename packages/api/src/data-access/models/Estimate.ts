import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const LINE_ITEM_TYPES = ["material", "labor", "equipment", "other"] as const;
const ESTIMATE_STATUSES = ["draft", "sent", "accepted"] as const;

// The estimate's inputs: which assembly, and the driver values it was generated
// with. driverValues is a free map (driver key -> number), so it's Mixed.
const estimateAssemblySchema = new Schema(
  {
    assemblyId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    driverValues: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

// A generated, frozen line item, embedded in the estimate (a single aggregate):
// always loaded and saved together, never queried on its own. _id is kept so the
// UI has a stable key for each line.
const lineItemSchema = new Schema(
  {
    phase: { type: String, default: null, trim: true },
    type: { type: String, required: true, enum: LINE_ITEM_TYPES },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, default: null, trim: true },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
    taxable: { type: Boolean, required: true, default: false },
    deliveryCost: { type: Number, required: true, min: 0, default: 0 },
    quantityFormula: { type: String, required: true, default: "" },
    sourceAssemblyId: { type: String, default: null },
    sourceLineKey: { type: String, default: null },
    // The task (group) this line belongs to; null = ungrouped. taskName is
    // denormalized so the snapshot keeps its label even after catalog edits.
    taskKey: { type: String, default: null },
    taskName: { type: String, default: null },
  },
  { _id: true },
);

/**
 * An estimate for a project: its inputs (`assemblies`) and the generated
 * snapshot (`lineItems`). Rates are stored as percentages (e.g. 40 = 40%),
 * snapshotted from PricingSettings at generation time; all monetary totals are
 * derived in the engine and never persisted, so the formula can change without a
 * migration.
 */
const estimateSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, default: "Estimate" },
    status: {
      type: String,
      required: true,
      enum: ESTIMATE_STATUSES,
      default: "draft",
    },
    overheadRate: { type: Number, required: true, default: 40 },
    profitRate: { type: Number, required: true, default: 15 },
    taxRate: { type: Number, required: true, default: 0 },
    assemblies: { type: [estimateAssemblySchema], default: [] },
    lineItems: { type: [lineItemSchema], default: [] },
  },
  { timestamps: true },
);

estimateSchema.index({ orgId: 1, projectId: 1, createdAt: -1 });

// Embedded line items keep their _id (InferSchemaType doesn't include it for
// subdocs), so the mapper can expose a stable id per line.
type LineItemDoc = InferSchemaType<typeof lineItemSchema> & {
  _id: Types.ObjectId;
};

// Inferred document shape — the single source of truth for the repository's
// mapper.
export type EstimateDoc = Omit<
  InferSchemaType<typeof estimateSchema>,
  "lineItems"
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lineItems: LineItemDoc[];
};

export const EstimateModel = model<EstimateDoc>("Estimate", estimateSchema);
