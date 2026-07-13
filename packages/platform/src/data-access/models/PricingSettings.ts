import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const laborRateSchema = new Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * Per-org pricing knobs for the cost buildup — one document per organization
 * (enforced by the unique `orgId` index). Rates are percentages. `overheadRate`
 * is margin-basis; see docs/data-model.md.
 */
const pricingSettingsSchema = new Schema(
  {
    orgId: { type: String, required: true, unique: true },
    taxRate: { type: Number, required: true, default: 0 },
    overheadRate: { type: Number, required: true, default: 40 },
    profitRate: { type: Number, required: true, default: 15 },
    laborRates: { type: [laborRateSchema], default: [] },
  },
  { timestamps: true },
);

export type PricingSettingsDoc = InferSchemaType<typeof pricingSettingsSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PricingSettingsModel = model<PricingSettingsDoc>(
  "PricingSettings",
  pricingSettingsSchema,
);
