import { describe, expect, it } from "bun:test";
import type { EstimateDocument, PartsOrderDocument } from "@landscape/platform";
import { TAX_NOTE } from "@landscape/platform";
import { renderEstimatePdf, renderPartsOrderPdf } from "./render.tsx";
import { countOccurrences, extractText, pageCount } from "./testSupport.ts";

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
    // A tax row would be labelled like every other row on the document.
    expect(text).not.toMatch(/\bTax\b/);
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

const partsDoc = (
  over: Partial<PartsOrderDocument> = {},
): PartsOrderDocument => ({
  company: doc().company,
  project: { name: "Oak St Rebuild", location: "12 Oak St" },
  title: "Parts order",
  createdAt: "2026-08-01T12:00:00.000Z",
  lines: [
    {
      description: "1in PVC pipe",
      unit: "ft",
      quantity: 25,
      unitPrice: 2,
      lineTotal: 50,
    },
    {
      description: "Shrub, 5 gal",
      unit: "ea",
      quantity: 6,
      unitPrice: 18,
      lineTotal: 108,
    },
  ],
  subtotal: 158,
  deliveryTotal: 12,
  total: 170,
  ...over,
});

describe("renderPartsOrderPdf", () => {
  it("produces a PDF", async () => {
    const bytes = await renderPartsOrderPdf(partsDoc());

    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  });

  it("prints each material with its quantity, unit price and line total", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).toContain("1in PVC pipe");
    expect(text).toContain("25");
    expect(text).toContain("$2.00");
    expect(text).toContain("$50.00");
  });

  it("shows delivery as its own line, not folded into unit prices", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).toContain("Delivery");
    expect(text).toContain("$12.00");
    expect(text).toContain("$170.00");
  });

  it("carries no tax note — the supplier charges their own", async () => {
    const text = extractText(await renderPartsOrderPdf(partsDoc()));

    expect(text).not.toContain(TAX_NOTE);
  });

  it("paginates a long order with a repeating header", async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
      description: `Material ${i + 1}`,
      unit: "ea",
      quantity: i + 1,
      unitPrice: 3,
      lineTotal: (i + 1) * 3,
    }));
    const bytes = await renderPartsOrderPdf(
      partsDoc({ lines, subtotal: 7455, deliveryTotal: 0, total: 7455 }),
    );
    const pages = pageCount(bytes);

    expect(pages).toBeGreaterThan(1);

    // The column header is `fixed`, so it appears once per page — a supplier
    // reading page 2 still knows which column is the unit price.
    expect(countOccurrences(bytes, "Unit price")).toBe(pages);
    // The last row and the total reach the final page.
    expect(extractText(bytes)).toContain("Material 70");
    expect(extractText(bytes)).toContain("$7,455.00");
  });
});
