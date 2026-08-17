/** File names within one version's folder. */
export const ESTIMATE_PDF_FILE = "estimate.pdf";
export const PARTS_ORDER_PDF_FILE = "parts-order.pdf";

/**
 * The content key a generated document is cached on.
 *
 * Both components are load-bearing. `updatedAt` alone is NOT sufficient: totals
 * are never stored — `computeEstimate` recomputes them from snapshotted inputs on
 * every read — so a deploy that changes the buildup reprices every existing
 * estimate without touching `updatedAt`. Keyed on the version alone, a cached PDF
 * would silently disagree with the screen after such a deploy.
 */
export function estimateDedupKey(
  estimateId: string,
  updatedAt: string,
  formulaVersion: number,
): string {
  return `estimate:${estimateId}:${Date.parse(updatedAt)}:${formulaVersion}`;
}

/**
 * Where a generated document lives.
 *
 * **The object path carries the same two components as the dedup key, and must.**
 * Keyed on the version alone, a formula-version bump would write new numbers over
 * the object that the *old* succeeded job row still points at — so that row would
 * hand out a URL to a PDF whose figures it never produced. Sharing both
 * components makes a job row and its object inseparable.
 */
export function documentObjectKey(
  orgId: string,
  estimateId: string,
  updatedAt: string,
  formulaVersion: number,
  file: string,
): string {
  const version = `${Date.parse(updatedAt)}-f${formulaVersion}`;
  return `orgs/${orgId}/estimates/${estimateId}/${version}/${file}`;
}

/** Branding lives outside the per-estimate tree — it outlives any one estimate. */
export function logoObjectKey(
  orgId: string,
  id: string,
  extension: string,
): string {
  return `orgs/${orgId}/branding/logo-${id}.${extension}`;
}

/**
 * Rounds money to cents. Every number that reaches a template goes through this,
 * so a template never rounds and therefore can never disagree with the estimate.
 * `+ 0` normalises -0, which would otherwise print as "-$0.00".
 */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
