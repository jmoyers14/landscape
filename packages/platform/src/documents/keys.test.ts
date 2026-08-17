import { describe, expect, it } from "bun:test";
import {
  ESTIMATE_PDF_FILE,
  PARTS_ORDER_PDF_FILE,
  documentObjectKey,
  estimateDedupKey,
  logoObjectKey,
  roundCents,
} from "./keys.ts";

const UPDATED_AT = "2026-08-01T12:00:00.000Z"; // 1785585600000
const MILLIS = 1785585600000;

describe("estimateDedupKey", () => {
  it("carries the estimate, its version and the formula version", () => {
    expect(estimateDedupKey("est_1", UPDATED_AT, 1)).toBe(
      `estimate:est_1:${MILLIS}:1`,
    );
  });

  it("changes when the estimate is edited", () => {
    expect(estimateDedupKey("est_1", "2026-08-01T12:00:01.000Z", 1)).not.toBe(
      estimateDedupKey("est_1", UPDATED_AT, 1),
    );
  });

  it("changes when the pricing formula is bumped, on an untouched estimate", () => {
    // The trap this component exists for: totals are recomputed on every read,
    // so a buildup change reprices an estimate without touching updatedAt.
    expect(estimateDedupKey("est_1", UPDATED_AT, 2)).not.toBe(
      estimateDedupKey("est_1", UPDATED_AT, 1),
    );
  });
});

describe("documentObjectKey", () => {
  it("lays the object out under the org, estimate and version", () => {
    expect(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, ESTIMATE_PDF_FILE),
    ).toBe(`orgs/org_1/estimates/est_1/${MILLIS}-f1/estimate.pdf`);
  });

  it("separates the two documents of one version", () => {
    expect(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, PARTS_ORDER_PDF_FILE),
    ).toBe(`orgs/org_1/estimates/est_1/${MILLIS}-f1/parts-order.pdf`);
  });

  it("moves when the formula version moves, so a bump cannot overwrite the object an old job row points at", () => {
    expect(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 2, ESTIMATE_PDF_FILE),
    ).not.toBe(
      documentObjectKey("org_1", "est_1", UPDATED_AT, 1, ESTIMATE_PDF_FILE),
    );
  });
});

describe("logoObjectKey", () => {
  it("puts branding outside the per-estimate tree", () => {
    expect(logoObjectKey("org_1", "abc-123", "png")).toBe(
      "orgs/org_1/branding/logo-abc-123.png",
    );
  });
});

describe("roundCents", () => {
  it("rounds to two places", () => {
    expect(roundCents(1234.5678)).toBe(1234.57);
  });

  it("rounds a half cent up rather than to even", () => {
    expect(roundCents(0.005)).toBe(0.01);
  });

  it("does not emit negative zero", () => {
    expect(Object.is(roundCents(-0.001), 0)).toBe(true);
  });
});
