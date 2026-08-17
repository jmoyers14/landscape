/**
 * The business identity behind an org's documents. Plain data, free of Mongoose
 * types. Every field is optional in substance — an empty `businessName` and a
 * null logo still render.
 */
export interface CompanyProfile {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  logoStorageKey: string | null;
  logoContentType: string | null;
}

/** Fields a caller may change. All optional; omitted fields are left alone. */
export type CompanyProfileChanges = Partial<CompanyProfile>;
