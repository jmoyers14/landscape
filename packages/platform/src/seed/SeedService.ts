/**
 * Populates an org with the starter catalog (the workbook's Package sheet).
 *
 * Two entry points with deliberately different safety profiles:
 *  - `seedNewOrg` is the production path (the org.created webhook). It is
 *    idempotent by convergence and NON-destructive — safe to run any number of
 *    times, from any partial state, without duplicating rows or touching the
 *    org's own custom catalog.
 *  - `resetOrgCatalog` is the dev path (the seed CLI). It DESTRUCTIVELY clears
 *    the org's catalog first, so it must never run against a real tenant.
 */
export interface SeedService {
  /**
   * Converge the org onto the starter catalog and ensure it has a company
   * profile. `businessName` comes from the Clerk organization, so a brand-new
   * org's documents are headed correctly before anyone visits settings.
   *
   * Upserts each starter material and assembly by its seed key, so re-running
   * updates the starter rows in place and leaves custom rows alone. This is what
   * the webhook handler calls.
   */
  seedNewOrg(orgId: string, businessName: string): Promise<void>;

  /**
   * Wipe the org's entire catalog (materials + assemblies) and re-seed from
   * scratch. Destructive — for local development only.
   */
  resetOrgCatalog(orgId: string): Promise<void>;
}

export const SEED_SERVICE_TOKEN = "SeedService";
