import { Schema, model } from "mongoose";

/**
 * A customer the contractor bids work to. Scoped to a Clerk organization via
 * `orgId` (the tenant boundary). A client can have many projects, so this is
 * its own collection rather than embedded data.
 */
const clientSchema = new Schema(
  {
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

clientSchema.index({ orgId: 1, createdAt: -1 });
// Supports the "is this email already used in the org?" uniqueness check.
clientSchema.index({ orgId: 1, email: 1 });

export const ClientModel = model("Client", clientSchema);
