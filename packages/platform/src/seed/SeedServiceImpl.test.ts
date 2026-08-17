import { describe, expect, it, mock } from "bun:test";
import {
  makeAssemblyRepoMock,
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeMaterialRepoMock,
  makePricingSettingsRepoMock,
} from "../test-support/index.ts";
import { SeedServiceImpl } from "./SeedServiceImpl.ts";

const build = (over: Parameters<typeof makeCompanyProfileRepoMock>[0] = {}) => {
  const profiles = makeCompanyProfileRepoMock(over);
  const service = new SeedServiceImpl(
    makeMaterialRepoMock({
      upsertBySeedKey: mock(async () => ({ id: "m1" }) as never),
    }),
    makeAssemblyRepoMock({
      upsertBySeedKey: mock(async () => ({ id: "a1" }) as never),
    }),
    makePricingSettingsRepoMock({ upsert: mock(async (_o, s) => s) }),
    profiles,
  );
  return { service, profiles };
};

describe("SeedServiceImpl company profile", () => {
  it("creates a profile for a new org, pre-filled with the org name", async () => {
    const { service, profiles } = build();
    await service.seedNewOrg("org_1", "Verdant Landscapes");

    expect(profiles.ensure).toHaveBeenCalledWith("org_1", "Verdant Landscapes");
  });

  it("uses ensure, so re-running never overwrites an edited profile", async () => {
    const existing = makeCompanyProfile({ businessName: "Renamed By User" });
    const { service, profiles } = build({ ensure: mock(async () => existing) });

    await service.seedNewOrg("org_1", "Verdant Landscapes");

    // ensure is $setOnInsert; there is no update path here to clobber with.
    expect(profiles.update).not.toHaveBeenCalled();
  });
});
