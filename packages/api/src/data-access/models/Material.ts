import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * Material catalog item, scoped to a Clerk organization via `orgId` (the tenant
 * boundary). Its own collection — a catalog is queried and edited on its own,
 * and referenced by many assemblies.
 */
const materialSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "General" },
    unit: { type: String, required: true, trim: true },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
    deliveryCost: { type: Number, required: true, min: 0, default: 0 },
    taxable: { type: Boolean, required: true, default: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

materialSchema.index({ orgId: 1, category: 1, name: 1 });

// The document shape, inferred from the schema — the single source of truth the
// repository maps from. We add the keys Mongoose manages itself (`_id` and the
// `timestamps` dates), which InferSchemaType doesn't include.
export type MaterialDoc = InferSchemaType<typeof materialSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

// Typing the model means `.lean()` returns MaterialDoc with no per-call generic.
export const MaterialModel = model<MaterialDoc>("Material", materialSchema);
