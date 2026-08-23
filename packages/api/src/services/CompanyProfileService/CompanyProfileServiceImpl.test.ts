import { describe, expect, it, mock } from "bun:test";
import {
  makeCompanyProfile,
  makeCompanyProfileRepoMock,
  makeObjectStorageFake,
} from "@landscape/platform/test-support";
import { ServiceError } from "../errors.ts";
import {
  CompanyProfileServiceImpl,
  MAX_LOGO_BYTES,
} from "./CompanyProfileServiceImpl.ts";

const build = (
  over: {
    profile?: ReturnType<typeof makeCompanyProfile> | null;
    storage?: ReturnType<typeof makeObjectStorageFake>;
  } = {},
) => {
  const profile =
    over.profile === undefined ? makeCompanyProfile() : over.profile;
  const profiles = makeCompanyProfileRepoMock({
    get: mock(async () => profile),
    update: mock(async (_orgId, changes) => ({
      ...makeCompanyProfile(),
      ...changes,
    })),
  });
  const storage = over.storage ?? makeObjectStorageFake();
  return {
    service: new CompanyProfileServiceImpl(profiles, storage),
    profiles,
    storage,
  };
};

describe("CompanyProfileServiceImpl.get", () => {
  it("returns an empty profile rather than null, so the settings screen always renders", async () => {
    const { service } = build({ profile: null });

    expect(await service.get("org_1")).toMatchObject({
      businessName: "",
      logoStorageKey: null,
    });
  });
});

describe("CompanyProfileServiceImpl.requestLogoUpload", () => {
  it("mints a signed PUT url under the org's branding prefix", async () => {
    const { service } = build();

    const ticket = await service.requestLogoUpload("org_1", "image/png");

    expect(ticket.key).toMatch(/^orgs\/org_1\/branding\/logo-[0-9a-f-]+\.png$/);
    expect(ticket.uploadUrl).toBe(`https://upload.test/${ticket.key}`);
  });

  it("uses the jpg extension for a jpeg", async () => {
    const { service } = build();

    expect(
      (await service.requestLogoUpload("org_1", "image/jpeg")).key,
    ).toMatch(/\.jpg$/);
  });

  it("rejects a content type outside the whitelist", async () => {
    const { service } = build();

    await expect(
      service.requestLogoUpload("org_1", "image/svg+xml"),
    ).rejects.toThrow(ServiceError);
  });
});

describe("CompanyProfileServiceImpl.confirmLogo", () => {
  const KEY = "orgs/org_1/branding/logo-abc.png";

  it("records the logo when the uploaded object checks out", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(1024), "image/png");
    const { service, profiles } = build({ storage });

    await service.confirmLogo("org_1", KEY);

    expect(profiles.update).toHaveBeenCalledWith("org_1", {
      logoStorageKey: KEY,
      logoContentType: "image/png",
    });
  });

  it("deletes the previous logo so branding doesn't accumulate", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(
      "orgs/org_1/branding/logo-old.png",
      new Uint8Array(4),
      "image/png",
    );
    await storage.put(KEY, new Uint8Array(1024), "image/png");
    const { service } = build({
      storage,
      profile: makeCompanyProfile({
        logoStorageKey: "orgs/org_1/branding/logo-old.png",
        logoContentType: "image/png",
      }),
    });

    await service.confirmLogo("org_1", KEY);

    expect(storage.objects.has("orgs/org_1/branding/logo-old.png")).toBe(false);
    // The new one survives — it is what the profile now points at.
    expect(storage.objects.has(KEY)).toBe(true);
  });

  it("rejects and cleans up an object over the size limit", async () => {
    // The check that CANNOT be done by the signed URL: it pins content type but
    // not size, so an oversize upload is only detectable after the fact.
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(MAX_LOGO_BYTES + 1), "image/png");
    const { service, profiles } = build({ storage });

    await expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(
      ServiceError,
    );
    expect(profiles.update).not.toHaveBeenCalled();
    expect(storage.objects.has(KEY)).toBe(false);
  });

  it("rejects an object whose stored type isn't an allowed image", async () => {
    const storage = makeObjectStorageFake();
    await storage.put(KEY, new Uint8Array(16), "application/zip");
    const { service } = build({ storage });

    await expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(
      ServiceError,
    );
    expect(storage.objects.has(KEY)).toBe(false);
  });

  it("rejects a key outside the caller's org", async () => {
    const storage = makeObjectStorageFake();
    const otherOrgKey = "orgs/org_2/branding/logo-abc.png";
    await storage.put(otherOrgKey, new Uint8Array(16), "image/png");
    const { service } = build({ storage });

    await expect(service.confirmLogo("org_1", otherOrgKey)).rejects.toThrow(
      ServiceError,
    );
    // Refused before touching storage — another org's object is not ours to delete.
    expect(storage.objects.has(otherOrgKey)).toBe(true);
  });

  it("rejects a key that was never uploaded", async () => {
    const { service } = build();

    await expect(service.confirmLogo("org_1", KEY)).rejects.toThrow(
      ServiceError,
    );
  });
});
