import { inject, injectable } from "tsyringe";
import {
  COMPANY_PROFILE_REPOSITORY_TOKEN,
  OBJECT_STORAGE_TOKEN,
  logoObjectKey,
  type CompanyProfile,
  type CompanyProfileChanges,
  type CompanyProfileRepository,
  type ObjectStorage,
} from "@landscape/platform";
import { ServiceError } from "../errors.ts";
import type {
  CompanyProfileService,
  LogoUploadTicket,
} from "./CompanyProfileService.ts";

/** Raster formats only. SVG is excluded — it can carry script. */
const LOGO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const EMPTY_PROFILE: CompanyProfile = {
  businessName: "",
  address: null,
  phone: null,
  email: null,
  licenseNumber: null,
  logoStorageKey: null,
  logoContentType: null,
};

@injectable()
export class CompanyProfileServiceImpl implements CompanyProfileService {
  constructor(
    @inject(COMPANY_PROFILE_REPOSITORY_TOKEN)
    private readonly profiles: CompanyProfileRepository,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
  ) {}

  async get(orgId: string): Promise<CompanyProfile> {
    // Seeding creates a row for every new org, but an org that predates that (or
    // a local database) may have none. An empty profile beats a null the screen
    // has to special-case — and documents render from it fine.
    return (await this.profiles.get(orgId)) ?? EMPTY_PROFILE;
  }

  async update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile> {
    // The logo is owned by the upload flow, which validates what it records.
    const { logoStorageKey: _key, logoContentType: _type, ...safe } = changes;
    return await this.profiles.update(orgId, safe);
  }

  async requestLogoUpload(
    orgId: string,
    contentType: string,
  ): Promise<LogoUploadTicket> {
    const extension = LOGO_EXTENSIONS[contentType];
    if (!extension) {
      throw new ServiceError("BAD_REQUEST", "Logo must be a PNG or JPEG image");
    }

    // A fresh key per upload, so a replacement never races the old object's
    // cached URL and the previous logo stays readable until confirm swaps it.
    const key = logoObjectKey(orgId, crypto.randomUUID(), extension);
    return {
      key,
      uploadUrl: await this.storage.signedUploadUrl(key, contentType),
    };
  }

  async confirmLogo(orgId: string, key: string): Promise<CompanyProfile> {
    // The key comes back from the browser, so it is untrusted input: confine it
    // to the caller's own branding prefix before touching storage.
    if (!key.startsWith(`orgs/${orgId}/branding/`)) {
      throw new ServiceError(
        "BAD_REQUEST",
        "That is not this organization's logo",
      );
    }

    const stored = await this.storage.head(key);
    if (!stored) {
      throw new ServiceError(
        "BAD_REQUEST",
        "No uploaded logo found at that key",
      );
    }

    // Everything the signed URL couldn't guarantee, checked now. Anything wrong
    // and the object is removed rather than left orphaned in the bucket.
    if (!LOGO_EXTENSIONS[stored.contentType]) {
      await this.storage.remove(key);
      throw new ServiceError("BAD_REQUEST", "Logo must be a PNG or JPEG image");
    }
    if (stored.byteSize > MAX_LOGO_BYTES) {
      await this.storage.remove(key);
      throw new ServiceError("BAD_REQUEST", "Logo must be 2MB or smaller");
    }

    const previous = (await this.profiles.get(orgId))?.logoStorageKey ?? null;
    const profile = await this.profiles.update(orgId, {
      logoStorageKey: key,
      logoContentType: stored.contentType,
    });

    // After the record is updated, so a failure here leaves a harmless orphan
    // rather than a profile pointing at an object that no longer exists.
    if (previous && previous !== key) {
      await this.storage.remove(previous);
    }

    return profile;
  }
}
