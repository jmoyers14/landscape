import { describe, expect, it, mock } from "bun:test";
import { EstimateServiceImpl } from "./EstimateServiceImpl.ts";
import type { PricingSettingsService } from "../PricingSettingsService/PricingSettingsService.ts";
import {
  makeAssemblyRepoMock,
  makeEstimateRepoMock,
  makeMaterialRepoMock,
  makeProjectRepoMock,
} from "../../test-support/repoMocks.ts";
import {
  makeEstimate,
  makePricingSettings,
  makeProject,
} from "../../test-support/factories.ts";
import {
  drainageAssembly,
  drainageMaterials,
  drainagePricing,
} from "../../test-support/drainageFixture.ts";
import type {
  Estimate,
  EstimateSnapshot,
} from "../../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import { ServiceError } from "../errors.ts";

const pricingStub = (
  over: Partial<PricingSettingsService> = {},
): PricingSettingsService => ({
  get: mock(async () => makePricingSettings()),
  update: mock(async () => makePricingSettings()),
  ...over,
});

const makeService = (
  parts: {
    estimates?: ReturnType<typeof makeEstimateRepoMock>;
    projects?: ReturnType<typeof makeProjectRepoMock>;
    assemblies?: ReturnType<typeof makeAssemblyRepoMock>;
    materials?: ReturnType<typeof makeMaterialRepoMock>;
    pricing?: PricingSettingsService;
  } = {},
) =>
  new EstimateServiceImpl(
    parts.estimates ?? makeEstimateRepoMock(),
    parts.projects ??
      makeProjectRepoMock({ findById: mock(async () => makeProject()) }),
    parts.assemblies ?? makeAssemblyRepoMock(),
    parts.materials ?? makeMaterialRepoMock(),
    parts.pricing ?? pricingStub(),
  );

// An estimate repo whose replaceSnapshot echoes the saved snapshot back as a
// persisted estimate (ids stamped), so the service's returned view reflects it.
const echoingEstimates = (over: Parameters<typeof makeEstimateRepoMock>[0] = {}) =>
  makeEstimateRepoMock({
    findById: mock(async () => makeEstimate({ status: "draft" })),
    replaceSnapshot: mock(async (_orgId: string, _id: string, snapshot: EstimateSnapshot) =>
      makeEstimate({
        status: "draft",
        assemblies: snapshot.assemblies,
        overheadRate: snapshot.overheadRate,
        profitRate: snapshot.profitRate,
        taxRate: snapshot.taxRate,
        lineItems: snapshot.lineItems.map((item, index) => ({
          id: `li_${index}`,
          ...item,
        })),
      }),
    ),
    ...over,
  });

describe("EstimateServiceImpl.create", () => {
  it("creates a draft snapshotting the org's current rates", async () => {
    const estimates = makeEstimateRepoMock({
      findByProject: mock(async () => []),
      create: mock(async (_orgId, data) => makeEstimate(data)),
    });
    const service = makeService({
      estimates,
      pricing: pricingStub({
        get: mock(async () =>
          makePricingSettings({ overheadRate: 40, profitRate: 15, taxRate: 7.75 }),
        ),
      }),
    });

    const view = await service.create("org_1", "project_1");

    const [, created] = (estimates.create as ReturnType<typeof mock>).mock
      .calls[0];
    expect(created.status).toBe("draft");
    expect(created.taxRate).toBe(7.75);
    expect(view.title).toBe("Estimate 1");
  });

  it("rejects creating an estimate for a missing project", async () => {
    const service = makeService({
      projects: makeProjectRepoMock({ findById: mock(async () => null) }),
    });
    expect(service.create("org_1", "missing")).rejects.toThrow(ServiceError);
  });
});

describe("EstimateServiceImpl.setAssemblies", () => {
  const drainageService = (
    estimates = echoingEstimates(),
  ): EstimateServiceImpl =>
    makeService({
      estimates,
      assemblies: makeAssemblyRepoMock({
        findById: mock(async () => drainageAssembly()),
      }),
      materials: makeMaterialRepoMock({
        findByIds: mock(async () => drainageMaterials()),
      }),
      pricing: pricingStub({ get: mock(async () => drainagePricing()) }),
    });

  it("regenerates a priced snapshot from the chosen assembly", async () => {
    const view = await drainageService().setAssemblies("org_1", "estimate_1", [
      { assemblyId: "drainage", driverValues: { drainageFt: 225 } },
    ]);

    const single = view.lineItems.find(
      (line) => line.sourceLineKey === "catchBasinSingle",
    )!;
    expect(single.quantity).toBe(3);
    expect(single.unitPrice).toBe(6.853);
    expect(view.totals.total).toBeGreaterThan(view.totals.directCost);
  });

  it("records the inputs and snapshots the rates used", async () => {
    const view = await drainageService().setAssemblies("org_1", "estimate_1", [
      { assemblyId: "drainage", driverValues: { drainageFt: 225 } },
    ]);

    expect(view.assemblies).toEqual([
      { assemblyId: "drainage", name: "Drainage", driverValues: { drainageFt: 225 } },
    ]);
    expect(view.taxRate).toBe(drainagePricing().taxRate);
  });

  it("falls back to each driver's default when none is provided", async () => {
    const view = await drainageService().setAssemblies("org_1", "estimate_1", [
      { assemblyId: "drainage" },
    ]);
    const single = view.lineItems.find(
      (line) => line.sourceLineKey === "catchBasinSingle",
    )!;
    // default drainageFt = 225 -> 3 catch basins
    expect(single.quantity).toBe(3);
  });

  it("throws NOT_FOUND for a missing estimate", async () => {
    const service = drainageService(
      makeEstimateRepoMock({ findById: mock(async () => null) }),
    );
    expect(service.setAssemblies("org_1", "missing", [])).rejects.toThrow(
      ServiceError,
    );
  });

  it("refuses to regenerate a non-draft estimate", async () => {
    const sent: Estimate = makeEstimate({ status: "sent" });
    const service = drainageService(
      makeEstimateRepoMock({ findById: mock(async () => sent) }),
    );
    expect(
      service.setAssemblies("org_1", "estimate_1", [
        { assemblyId: "drainage" },
      ]),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects a selection referencing an unknown assembly", async () => {
    const service = makeService({
      estimates: echoingEstimates(),
      assemblies: makeAssemblyRepoMock({ findById: mock(async () => null) }),
      pricing: pricingStub({ get: mock(async () => drainagePricing()) }),
    });
    expect(
      service.setAssemblies("org_1", "estimate_1", [
        { assemblyId: "nope" },
      ]),
    ).rejects.toThrow(ServiceError);
  });
});

describe("EstimateServiceImpl.updateMeta", () => {
  it("throws NOT_FOUND when the estimate is missing", async () => {
    const service = makeService({
      estimates: makeEstimateRepoMock({ updateMeta: mock(async () => null) }),
    });
    expect(
      service.updateMeta("org_1", "missing", { title: "x" }),
    ).rejects.toThrow(ServiceError);
  });

  it("returns the recomputed view after a meta edit", async () => {
    const service = makeService({
      estimates: makeEstimateRepoMock({
        updateMeta: mock(async () => makeEstimate({ title: "Renamed" })),
      }),
    });
    const view = await service.updateMeta("org_1", "estimate_1", {
      title: "Renamed",
    });
    expect(view.title).toBe("Renamed");
  });
});
