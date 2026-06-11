import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Generic placeholder model (rename when the real domain takes shape). Every
 * document is scoped to a Clerk organization via `orgId` — the tenant boundary.
 * Queries must always filter by orgId so one business never sees another's data.
 */
const itemSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// Optimizes the common "list this org's items, newest first" query.
itemSchema.index({ orgId: 1, createdAt: -1 });

export type ItemDocument = InferSchemaType<typeof itemSchema>;

export const ItemModel = model("Item", itemSchema);
