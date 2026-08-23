import { Schema, model, type InferSchemaType, type Types } from "mongoose";

/**
 * The business identity that heads every client- and supplier-facing document —
 * one document per organization (enforced by the unique `orgId` index).
 *
 * Every field except the name is optional, and the name may be empty: a
 * client-facing document must never fail to render over missing branding.
 */
const companyProfileSchema = new Schema(
  {
    orgId: { type: String, required: true, unique: true },
    businessName: { type: String, required: true, trim: true, default: "" },
    address: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true },
    licenseNumber: { type: String, default: null, trim: true },
    // The logo's key in object storage, not the bytes. Documents fetch it at
    // render time; the browser never sees the key.
    logoStorageKey: { type: String, default: null },
    logoContentType: { type: String, default: null },
  },
  { timestamps: true },
);

export type CompanyProfileDoc = InferSchemaType<typeof companyProfileSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CompanyProfileModel = model<CompanyProfileDoc>(
  "CompanyProfile",
  companyProfileSchema,
);
