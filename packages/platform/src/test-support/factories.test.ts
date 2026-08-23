import { describe, expect, it } from "bun:test";
import { makeEstimate } from "./factories.ts";

describe("makeEstimate", () => {
  it("carries an ISO updatedAt, since the PDF dedup key is keyed on it", () => {
    const estimate = makeEstimate();
    expect(estimate.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(estimate.updatedAt))).toBe(false);
  });

  it("lets a test pin a distinct updatedAt", () => {
    const estimate = makeEstimate({ updatedAt: "2026-02-02T00:00:00.000Z" });
    expect(Date.parse(estimate.updatedAt)).toBeGreaterThan(
      Date.parse(estimate.createdAt),
    );
  });
});
