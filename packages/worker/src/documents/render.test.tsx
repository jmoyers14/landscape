import { describe, expect, it } from "bun:test";
import type { EstimateDocument } from "@landscape/platform";
import { TAX_NOTE } from "@landscape/platform";
import { renderEstimatePdf } from "./render.tsx";
import { extractText, pageCount } from "./testSupport.ts";

const doc = (over: Partial<EstimateDocument> = {}): EstimateDocument => ({
  company: {
    businessName: "Verdant Landscapes",
    address: "100 Garden Way, Springfield, OR 97477",
    phone: "555-0100",
    email: "bids@verdant.example",
    licenseNumber: "CCB #123456",
    logo: null,
  },
  client: {
    name: "Ada Client",
    address: "12 Oak St",
    email: "ada@example.com",
    phone: "555-0111",
  },
  project: { name: "Oak St Rebuild", location: "12 Oak St" },
  title: "Estimate",
  createdAt: "2026-08-01T12:00:00.000Z",
  groups: [
    { label: "Irrigation", amount: 4601.56 },
    { label: "Planting", amount: 2310.4 },
  ],
  total: 6911.96,
  taxNote: TAX_NOTE,
  ...over,
});

describe("renderEstimatePdf", () => {
  it("produces a PDF", async () => {
    const bytes = await renderEstimatePdf(doc());

    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("prints the business name, the project and the client", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain("Verdant Landscapes");
    expect(text).toContain("Oak St Rebuild");
    expect(text).toContain("Ada Client");
  });

  it("prints one row per group and the grand total", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain("Irrigation");
    expect(text).toContain("$4,601.56");
    expect(text).toContain("Planting");
    expect(text).toContain("$2,310.40");
    expect(text).toContain("$6,911.96");
  });

  it("carries the tax footnote and shows no tax line", async () => {
    const text = extractText(await renderEstimatePdf(doc()));

    expect(text).toContain(TAX_NOTE);
    expect(text).not.toMatch(/^\s*Tax\b/m);
  });

  it("renders with no client and no logo rather than failing", async () => {
    const bytes = await renderEstimatePdf(doc({ client: null }));

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("paginates a long estimate", async () => {
    const groups = Array.from({ length: 80 }, (_, i) => ({
      label: `Assembly ${i + 1}`,
      amount: 100 + i,
    }));
    const bytes = await renderEstimatePdf(
      doc({ groups, total: groups.reduce((a, g) => a + g.amount, 0) }),
    );

    expect(pageCount(bytes)).toBeGreaterThan(1);
    // The last row and the total land on the final page: nothing is dropped at
    // a page break, and extractText reads past page one.
    expect(extractText(bytes)).toContain("Assembly 80");
    expect(extractText(bytes)).toContain("$11,160.00");
  });
});
