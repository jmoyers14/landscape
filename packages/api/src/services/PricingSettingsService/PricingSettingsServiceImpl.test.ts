import { describe, expect, it, mock } from "bun:test";
import {
  DEFAULT_PRICING_SETTINGS,
  PricingSettingsServiceImpl,
} from "./PricingSettingsServiceImpl.ts";
import { makePricingSettingsRepoMock } from "@landscape/platform/test-support";
import { makePricingSettings } from "@landscape/platform/test-support";
import { ServiceError } from "../errors.ts";

describe("PricingSettingsServiceImpl", () => {
  it("returns defaults when the org has no saved settings", async () => {
    const repo = makePricingSettingsRepoMock({ get: mock(async () => null) });
    const service = new PricingSettingsServiceImpl(repo);
    expect(await service.get("org_1")).toEqual(DEFAULT_PRICING_SETTINGS);
  });

  it("returns saved settings when present", async () => {
    const saved = makePricingSettings({ taxRate: 9.25 });
    const repo = makePricingSettingsRepoMock({ get: mock(async () => saved) });
    const service = new PricingSettingsServiceImpl(repo);
    expect(await service.get("org_1")).toEqual(saved);
  });

  it("upserts valid settings, trimming labor keys and labels", async () => {
    const repo = makePricingSettingsRepoMock({
      upsert: mock(async (_orgId, settings) => settings),
    });
    const service = new PricingSettingsServiceImpl(repo);
    const result = await service.update(
      "org_1",
      makePricingSettings({
        laborRates: [{ key: " general ", label: " General ", rate: 35 }],
      }),
    );
    expect(result.laborRates[0]).toEqual({
      key: "general",
      label: "General",
      rate: 35,
    });
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects a negative tax rate", async () => {
    const service = new PricingSettingsServiceImpl(makePricingSettingsRepoMock());
    expect(
      service.update("org_1", makePricingSettings({ taxRate: -1 })),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects an overhead rate of 100 or more (margin basis)", async () => {
    const service = new PricingSettingsServiceImpl(makePricingSettingsRepoMock());
    expect(
      service.update("org_1", makePricingSettings({ overheadRate: 100 })),
    ).rejects.toThrow(ServiceError);
  });

  it("rejects duplicate labor rate keys", async () => {
    const service = new PricingSettingsServiceImpl(makePricingSettingsRepoMock());
    expect(
      service.update(
        "org_1",
        makePricingSettings({
          laborRates: [
            { key: "general", label: "A", rate: 35 },
            { key: "general", label: "B", rate: 40 },
          ],
        }),
      ),
    ).rejects.toThrow(ServiceError);
  });
});
