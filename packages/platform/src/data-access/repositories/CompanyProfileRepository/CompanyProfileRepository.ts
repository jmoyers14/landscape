import type { CompanyProfile, CompanyProfileChanges } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the per-org company profile singleton.
 *
 * `ensure` and `update` are separate on purpose. `ensure` is $setOnInsert — the
 * seed path calls it on every `organization.created` redelivery and must never
 * overwrite a profile the customer has since edited. `update` is the deliberate
 * write from the settings screen.
 */
export interface CompanyProfileRepository {
  get(orgId: string): Promise<CompanyProfile | null>;
  /** Creates the profile if absent, pre-filled with `businessName`. Idempotent. */
  ensure(orgId: string, businessName: string): Promise<CompanyProfile>;
  /** Applies changes, creating the row if it somehow doesn't exist yet. */
  update(
    orgId: string,
    changes: CompanyProfileChanges,
  ): Promise<CompanyProfile>;
}
