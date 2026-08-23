import { describe, expect, it, mock } from "bun:test";
import { computeEstimate } from "@landscape/domain";
import {
  makeClient,
  makeClientRepoMock,
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeEstimate,
  makeEstimateRepoMock,
  makeObjectStorageFake,
  makeProject,
  makeProjectRepoMock,
} from "../test-support/index.ts";
import { MissingEstimateError } from "./errors.ts";
import { DocumentAssemblyServiceImpl } from "./DocumentAssemblyServiceImpl.ts";
import { TAX_NOTE } from "./types.ts";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as never;

const line = (over: Record<string, unknown> = {}) => ({
  id: "line_1",
  phase: "Irrigation",
  type: "material" as const,
  description: "1in PVC pipe",
  quantity: 10,
  unit: "ft",
  unitPrice: 2,
  taxable: true,
  deliveryCost: 5,
  quantityFormula: "qty",
  sourceAssemblyId: "asm_irrigation",
  sourceLineKey: "pipe",
  taskKey: null,
  taskName: null,
  ...over,
});

const estimateWithTwoAssemblies = () =>
  makeEstimate({
    taxRate: 8,
    assemblies: [
      { assemblyId: "asm_irrigation", name: "Irrigation", driverValues: {} },
      { assemblyId: "asm_planting", name: "Planting", driverValues: {} },
    ],
    lineItems: [
      line(),
      line({
        id: "line_2",
        type: "labor",
        description: "Install",
        unitPrice: 40,
        quantity: 4,
        taxable: false,
        deliveryCost: 0,
      }),
      line({
        id: "line_3",
        phase: "Planting",
        description: "Shrub",
        sourceAssemblyId: "asm_planting",
        quantity: 6,
        unitPrice: 18,
      }),
    ],
  });

const build = (
  over: {
    estimate?: ReturnType<typeof makeEstimate> | null;
    profile?: ReturnType<typeof makeCompanyProfile> | null;
    storage?: ReturnType<typeof makeObjectStorageFake>;
  } = {},
) => {
  const estimate =
    over.estimate === undefined ? estimateWithTwoAssemblies() : over.estimate;
  const storage = over.storage ?? makeObjectStorageFake();
  const service = new DocumentAssemblyServiceImpl(
    makeEstimateRepoMock({ findById: mock(async () => estimate) }),
    makeProjectRepoMock({
      findById: mock(async () =>
        makeProject({ name: "Oak St Rebuild", location: "12 Oak St" }),
      ),
    }),
    makeClientRepoMock({
      findById: mock(async () => makeClient({ name: "Ada Client" })),
    }),
    makeCompanyProfileRepoMock({
      get: mock(async () =>
        over.profile === undefined ? makeCompanyProfile() : over.profile,
      ),
    }),
    storage,
    noopLogger,
  );
  return { service, estimate, storage };
};

describe("DocumentAssemblyServiceImpl.buildEstimateDocument", () => {
  it("emits one row per assembly, labelled and ordered as the estimate orders them", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Irrigation", "Planting"]);
  });

  it("groups by sourceAssemblyId, not by the phase label", async () => {
    // Two instances of one assembly with the same phase string must stay one
    // row; two DIFFERENT assemblies sharing a phase label must stay two.
    const estimate = makeEstimate({
      assemblies: [
        { assemblyId: "asm_a", name: "Drainage A", driverValues: {} },
        { assemblyId: "asm_b", name: "Drainage B", driverValues: {} },
      ],
      lineItems: [
        line({ id: "l1", phase: "Drainage", sourceAssemblyId: "asm_a" }),
        line({ id: "l2", phase: "Drainage", sourceAssemblyId: "asm_b" }),
      ],
    });
    const { service } = build({ estimate });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Drainage A", "Drainage B"]);
  });

  it("gives lines with a null sourceAssemblyId their own row, so every line lands in exactly one group", async () => {
    const estimate = makeEstimate({
      assemblies: [{ assemblyId: "asm_a", name: "Drainage", driverValues: {} }],
      lineItems: [
        line({ id: "l1", sourceAssemblyId: "asm_a" }),
        line({ id: "l2", sourceAssemblyId: null, phase: null }),
      ],
    });
    const { service } = build({ estimate });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.groups.map((g) => g.label)).toEqual(["Drainage", "Other"]);
  });

  it("has rows that sum to the total shown", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    const summed = doc.groups.reduce((acc, g) => acc + g.amount, 0);
    expect(Math.round(summed * 100)).toBe(Math.round(doc.total * 100));
  });

  it("agrees with the engine's total for the job", async () => {
    const { service, estimate } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    // The printed total is the sum of the ROUNDED rows, so it can drift from the
    // engine's unrounded total by up to half a cent per row. That drift is the
    // deliberate cost of the column always adding up for the customer; what must
    // not happen is drift beyond it, which would mean a grouping or buildup bug.
    const engineTotal = computeEstimate(estimate!).totals.total;
    expect(Math.abs(doc.total - engineTotal)).toBeLessThanOrEqual(
      0.005 * doc.groups.length,
    );
  });

  it("emits no tax line and carries the footnote instead", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.taxNote).toBe(TAX_NOTE);
    expect(doc.groups.some((g) => /tax/i.test(g.label))).toBe(false);
    expect(doc).not.toHaveProperty("tax");
  });

  it("rounds every amount to cents so a template never has to", async () => {
    const { service } = build();
    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    for (const group of [...doc.groups, { label: "total", amount: doc.total }]) {
      expect(Number.isInteger(Math.round(group.amount * 100))).toBe(true);
      expect(group.amount).toBe(Math.round(group.amount * 100) / 100);
    }
  });

  it("embeds the logo bytes when the profile has one", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(
      "orgs/org_1/branding/logo-1.png",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );
    const { service } = build({
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/logo-1.png",
        logoContentType: "image/png",
      }),
      storage,
    });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.logo).toEqual({
      data: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
  });

  it("renders without a logo rather than failing when the object is gone", async () => {
    const { service } = build({
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/missing.png",
        logoContentType: "image/png",
      }),
    });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.logo).toBeNull();
  });

  it("renders with an empty company when the org has no profile at all", async () => {
    const { service } = build({ profile: null });

    const doc = await service.buildEstimateDocument("org_1", "estimate_1");

    expect(doc.company.businessName).toBe("");
    expect(doc.company.logo).toBeNull();
  });

  it("throws MissingEstimateError for an unknown or cross-org estimate", async () => {
    const { service } = build({ estimate: null });

    expect(service.buildEstimateDocument("org_1", "nope")).rejects.toThrow(
      MissingEstimateError,
    );
  });
});

describe("DocumentAssemblyServiceImpl.buildPartsOrderDocument", () => {
  const materialsEstimate = () =>
    makeEstimate({
      taxRate: 8,
      assemblies: [
        { assemblyId: "asm_a", name: "Irrigation", driverValues: {} },
        { assemblyId: "asm_b", name: "Planting", driverValues: {} },
      ],
      lineItems: [
        line({
          id: "l1",
          description: "1in PVC pipe",
          unit: "ft",
          quantity: 10,
          unitPrice: 2,
          deliveryCost: 5,
        }),
        // Same description/unit/price from another assembly — must merge.
        line({
          id: "l2",
          description: "1in PVC pipe",
          unit: "ft",
          quantity: 15,
          unitPrice: 2,
          deliveryCost: 7,
          sourceAssemblyId: "asm_b",
        }),
        // Same description, DIFFERENT price — must not merge.
        line({
          id: "l3",
          description: "1in PVC pipe",
          unit: "ft",
          quantity: 4,
          unitPrice: 3,
          deliveryCost: 0,
        }),
        line({
          id: "l4",
          type: "labor",
          description: "Install",
          quantity: 8,
          unitPrice: 45,
          taxable: false,
          deliveryCost: 0,
        }),
      ],
    });

  it("lists only material lines — a supplier is not quoting labor", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(doc.lines.some((l) => l.description === "Install")).toBe(false);
  });

  it("merges identical materials and sums their quantities", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    const merged = doc.lines.find((l) => l.unitPrice === 2);
    expect(merged).toMatchObject({
      description: "1in PVC pipe",
      unit: "ft",
      quantity: 25,
      lineTotal: 50,
    });
  });

  it("keeps materials at different unit prices apart", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(
      doc.lines.filter((l) => l.description === "1in PVC pipe"),
    ).toHaveLength(2);
  });

  it("quotes catalog cost, never a marked-up price", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    // 2.00 is the line's unitPrice as snapshotted — overhead and profit only
    // ever apply in aggregate, so a line's price IS cost.
    expect(doc.lines.find((l) => l.unitPrice === 2)?.unitPrice).toBe(2);
  });

  it("subtotals pre-tax and notes delivery separately", async () => {
    const { service } = build({ estimate: materialsEstimate() });
    const doc = await service.buildPartsOrderDocument("org_1", "estimate_1");

    expect(doc.subtotal).toBe(62); // (25 × 2) + (4 × 3)
    expect(doc.deliveryTotal).toBe(12); // 5 + 7 + 0
    expect(doc.total).toBe(74);
  });

  it("throws MissingEstimateError for an unknown or cross-org estimate", async () => {
    const { service } = build({ estimate: null });

    expect(service.buildPartsOrderDocument("org_1", "nope")).rejects.toThrow(
      MissingEstimateError,
    );
  });
});
