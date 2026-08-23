import type {
  CompanyProfile,
  CompanyProfileChanges,
} from "@landscape/platform";

export type { CompanyProfile, CompanyProfileChanges };

/** What the browser needs to upload a logo without the bytes touching the API. */
export interface LogoUploadTicket {
  key: string;
  uploadUrl: string;
}

/**
 * The org's business identity, and the two-step logo upload.
 *
 * The upload is split because a signed PUT URL can pin content-type but cannot
 * enforce SIZE. So the browser uploads straight to storage, then `confirmLogo`
 * inspects what actually landed and either records it or deletes it.
 */
export interface CompanyProfileService {
  get(orgId: string): Promise<CompanyProfile>;
  update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile>;
  requestLogoUpload(
    orgId: string,
    contentType: string,
  ): Promise<LogoUploadTicket>;
  confirmLogo(orgId: string, key: string): Promise<CompanyProfile>;
}
