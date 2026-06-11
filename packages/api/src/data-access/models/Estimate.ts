import { Schema, model } from "mongoose";

const LINE_ITEM_TYPES = ["material", "labor", "equipment", "other"] as const;
const ESTIMATE_STATUSES = ["draft", "sent", "accepted"] as const;

// Line items are embedded in the estimate (a single aggregate): they're always
// loaded and saved together, and never queried on their own.
const lineItemSchema = new Schema(
  {
    phase: { type: String, default: null, trim: true },
    type: { type: String, required: true, enum: LINE_ITEM_TYPES },
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, default: null, trim: true },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: true },
);

/**
 * An estimate for a project. Rates are stored as percentages (e.g. 40 = 40%);
 * all monetary totals are derived in EstimateService and never persisted, so
 * the formula can change without a migration.
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
    lineItems: { type: [lineItemSchema], default: [] },
  },
  { timestamps: true },
);

estimateSchema.index({ orgId: 1, projectId: 1, createdAt: -1 });

export const EstimateModel = model("Estimate", estimateSchema);
