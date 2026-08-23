import { injectable } from "tsyringe";
import {
  CompanyProfileModel,
  type CompanyProfileDoc,
} from "../../models/CompanyProfile.ts";
import type {
  CompanyProfile,
  CompanyProfileChanges,
  CompanyProfileRepository,
} from "./CompanyProfileRepository.ts";

/**
 * Mongoose-backed CompanyProfileRepository. Documents are mapped to the plain
 * CompanyProfile entity so Mongoose types never escape.
 */
@injectable()
export class CompanyProfileRepositoryImpl implements CompanyProfileRepository {
  async get(orgId: string): Promise<CompanyProfile | null> {
    const doc = await CompanyProfileModel.findOne({ orgId }).lean();
    return doc ? toProfile(doc) : null;
  }

  async ensure(orgId: string, businessName: string): Promise<CompanyProfile> {
    // $setOnInsert only: a redelivered organization.created must find the
    // profile exactly as the customer left it.
    const doc = await CompanyProfileModel.findOneAndUpdate(
      { orgId },
      { $setOnInsert: { orgId, businessName } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    return toProfile(doc);
  }

  async update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile> {
    const doc = await CompanyProfileModel.findOneAndUpdate(
      { orgId },
      { $set: { orgId, ...changes } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
    return toProfile(doc);
  }
}

function toProfile(doc: CompanyProfileDoc): CompanyProfile {
  return {
    businessName: doc.businessName ?? "",
    address: doc.address ?? null,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    licenseNumber: doc.licenseNumber ?? null,
    logoStorageKey: doc.logoStorageKey ?? null,
    logoContentType: doc.logoContentType ?? null,
  };
}
