import { describe, expect, it, mock } from "bun:test";
import { AssemblyServiceImpl } from "./AssemblyServiceImpl.ts";
import type { AssemblyServiceInput } from "./AssemblyService.ts";
import type { PricingSettingsService } from "../PricingSettingsService/PricingSettingsService.ts";
import {
  makeAssemblyRepoMock,
  makeMaterialRepoMock,
} from "../../test-support/repoMocks.ts";
import {
  makeAssembly,
  makeMaterial,
  makePricingSettings,
} from "../../test-support/factories.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
} from "../../test-support/drainageFixture.ts";
import { ServiceError } from "../errors.ts";

// A valid Drainage-style input: one labor line (rate "general") and one
// material line (material "material_1"), both of which the mocks below resolve.
const baseInput = (
  over: Partial<AssemblyServiceInput> = {},
): AssemblyServiceInput => ({
  name: "Drainage",
  category: "Drainage",
  description: null,
  sortOrder: 1,
  active: true,
  drivers: [
    { key: "drainageFt", label: "Drainage length", unit: "ft.", defaultValue: 225 },
  ],
  tasks: [],
  lines: [
    {
      key: "layout",
      kind: "labor",
      description: "Lay out",
      quantityFormula: "0.095 * drainageFt",
      laborRateKey: "general",
      sortOrder: 1,
    },
    {
      key: "catchBasin",
      kind: "material",
      description: "Catch basin",
      quantityFormula: "round(drainageFt / 85)",
      materialId: "material_1",
      deliveriesFormula: null,
      sortOrder: 2,
    },
  ],
  ...over,
});

const pricingStub = (
  over: Partial<PricingSettingsService> = {},
): PricingSettingsService => ({
  get: mock(async () => makePricingSettings()),
  update: mock(async () => makePricingSettings()),
  ...over,
});

const materialsThatResolve = () =>
  makeMaterialRepoMock({
    findByIds: mock(async () => [makeMaterial({ id: "material_1" })]),
  });

const makeService = (
  parts: {
    assemblies?: ReturnType<typeof makeAssemblyRepoMock>;
    materials?: ReturnType<typeof makeMaterialRepoMock>;
    pricing?: PricingSettingsService;
  } = {},
) =>
  new AssemblyServiceImpl(
    parts.assemblies ??
      makeAssemblyRepoMock({ create: mock(async (_o, d) => makeAssembly(d)) }),
    parts.materials ?? materialsThatResolve(),
    parts.pricing ?? pricingStub(),
  );

describe("AssemblyServiceImpl validation", () => {
  it("creates a valid assembly and stamps it source=custom", async () => {
    const assemblies = makeAssemblyRepoMock({
      create: mock(async (_o, d) => makeAssembly(d)),
    });
    const service = makeService({ assemblies });

    await service.create("org_1", baseInput());

    const [, created] = (assemblies.create as ReturnType<typeof mock>).mock
      .calls[0];
    expect(created.source).toBe("custom");
  });

  it("rejects a formula that references an unknown variable", async () => {
    const service = makeService();
    expect(
      service.create(
        "org_1",
        baseInput({
          lines: [
            {
              key: "x",
              kind: "labor",
              description: "x",
              quantityFormula: "nope * 2",
              laborRateKey: "general",
              sortOrder: 1,
            },
          ],
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a reference cycle between lines", async () => {
    const service = makeService();
    expect(
      service.create(
        "org_1",
        baseInput({
          lines: [
            {
              key: "a",
              kind: "labor",
              description: "a",
              quantityFormula: "b + 1",
              laborRateKey: "general",
              sortOrder: 1,
            },
            {
              key: "b",
              kind: "labor",
              description: "b",
              quantityFormula: "a + 1",
              laborRateKey: "general",
              sortOrder: 2,
            },
          ],
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects duplicate line keys", async () => {
    const service = makeService();
    const dupe = baseInput();
    dupe.lines[1] = { ...dupe.lines[1], key: "layout" };
    expect(service.create("org_1", dupe)).rejects.toThrow(ServiceError);
  });

  it("rejects a material line whose material does not exist", async () => {
    const service = makeService({
      materials: makeMaterialRepoMock({ findByIds: mock(async () => []) }),
    });
    expect(service.create("org_1", baseInput())).rejects.toThrow(ServiceError);
  });

  it("rejects a labor line whose rate key is not configured", async () => {
    const service = makeService();
    expect(
      service.create(
        "org_1",
        baseInput({
          lines: [
            {
              key: "layout",
              kind: "labor",
              description: "Lay out",
              quantityFormula: "0.095 * drainageFt",
              laborRateKey: "foreman",
              sortOrder: 1,
            },
          ],
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });

  // `defineTask` controls whether the assembly declares the "install" task that
  // the lines reference, so we can exercise both the valid and dangling cases.
  const groupedInput = (
    taskKey: string,
    defineTask = true,
  ): AssemblyServiceInput =>
    baseInput({
      tasks: defineTask
        ? [{ key: "install", name: "Install", sortOrder: 1 }]
        : [],
      lines: [
        {
          key: "layout",
          kind: "labor",
          description: "Lay out",
          quantityFormula: "0.095 * drainageFt",
          laborRateKey: "general",
          taskKey,
          sortOrder: 1,
        },
        {
          key: "catchBasin",
          kind: "material",
          description: "Catch basin",
          quantityFormula: "round(drainageFt / 85)",
          materialId: "material_1",
          deliveriesFormula: null,
          taskKey,
          sortOrder: 2,
        },
      ],
    });

  it("rejects a line referencing a task that doesn't exist", async () => {
    const service = makeService();
    expect(
      service.create("org_1", groupedInput("install", false)),
    ).rejects.toThrow(ServiceError);
  });

  it("accepts lines referencing a declared task", async () => {
    const assemblies = makeAssemblyRepoMock({
      create: mock(async (_o, d) => makeAssembly(d)),
    });
    const service = makeService({ assemblies });
    await service.create("org_1", groupedInput("install"));
    const [, created] = (assemblies.create as ReturnType<typeof mock>).mock
      .calls[0];
    expect(created.lines[1].taskKey).toBe("install");
  });

  it("throws NOT_FOUND when updating a missing assembly", async () => {
    const service = makeService({
      assemblies: makeAssemblyRepoMock({ update: mock(async () => null) }),
    });
    expect(service.update("org_1", "missing", baseInput())).rejects.toThrow(
      ServiceError,
    );
  });
});

describe("AssemblyServiceImpl.preview", () => {
  // Drainage fixture from test-support (independent of the production seed).
  const fixtureMaterials = drainageMaterials();
  const fixtureAssembly = drainageAssembly();

  const previewService = () =>
    makeService({
      assemblies: makeAssemblyRepoMock({
        findById: mock(async () => fixtureAssembly),
      }),
      materials: makeMaterialRepoMock({
        findByIds: mock(async () => fixtureMaterials),
      }),
      pricing: pricingStub({ get: mock(async () => drainagePricing()) }),
    });

  it("generates Drainage line items matching the spreadsheet", async () => {
    const { lineItems, totals } = await previewService().preview(
      "org_1",
      "drainage",
      { drainageFt: 225 },
    );
    const byKey = (key: string) =>
      lineItems.find((line) => line.sourceLineKey === key)!;

    // quantities resolved from the seeded formulas (cells E11/E21/E25, N9)
    expect(byKey("catchBasinSingle").quantity).toBe(3);
    expect(byKey("solidPipe3").quantity).toBe(23);
    expect(byKey("curbCore").quantity).toBe(2);
    expect(byKey("layout").quantity).toBeCloseTo(21.375, 5);

    // unit prices came from the loaded material / labor rate — proves the repos
    // and settings were wired in, not just the formulas.
    expect(byKey("catchBasinSingle").unitPrice).toBe(6.853);
    expect(byKey("layout").unitPrice).toBe(35);

    // the cost buildup ran
    expect(totals.directCost).toBeCloseTo(
      totals.materialCost + totals.laborCost,
      5,
    );
    expect(totals.total).toBeGreaterThan(totals.directCost);
  });

  it("falls back to each driver's default when no value is given", async () => {
    const { lineItems } = await previewService().preview("org_1", "drainage");
    // default drainageFt = 225 -> catch basins = 3
    const single = lineItems.find(
      (line) => line.sourceLineKey === "catchBasinSingle",
    )!;
    expect(single.quantity).toBe(3);
  });

  it("throws NOT_FOUND for an unknown assembly", async () => {
    const service = makeService({
      assemblies: makeAssemblyRepoMock({ findById: mock(async () => null) }),
    });
    expect(service.preview("org_1", "missing")).rejects.toThrow(ServiceError);
  });
});
