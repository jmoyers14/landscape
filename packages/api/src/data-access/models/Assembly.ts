import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const ASSEMBLY_LINE_KINDS = ["material", "labor"] as const;

// Drivers and lines are embedded: always loaded, saved, and versioned with the
// assembly, never queried on their own.
const driverSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    defaultValue: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const lineSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    kind: { type: String, required: true, enum: ASSEMBLY_LINE_KINDS },
    description: { type: String, required: true, trim: true },
    // Text expression resolved by services/EstimateService/formula.ts.
    quantityFormula: { type: String, required: true, trim: true },
    materialId: { type: String, default: null },
    deliveriesFormula: { type: String, default: null },
    laborRateKey: { type: String, default: null },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

/**
 * A reusable estimating recipe for one section of work (Drainage, Irrigation,
 * …). Org-scoped via `orgId`. See docs/data-model.md.
 */
const assemblySchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "General" },
    description: { type: String, default: null, trim: true },
    sortOrder: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
    drivers: { type: [driverSchema], default: [] },
    lines: { type: [lineSchema], default: [] },
  },
  { timestamps: true },
);

assemblySchema.index({ orgId: 1, sortOrder: 1 });

// Inferred document shape — the single source of truth for the repository's
// mapper. Embedded driver/line subdocs are inferred from their schemas too.
export type AssemblyDoc = InferSchemaType<typeof assemblySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AssemblyModel = model<AssemblyDoc>("Assembly", assemblySchema);
