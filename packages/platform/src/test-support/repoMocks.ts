/**
 * Repository mock builders for service-layer tests. Each returns an object
 * implementing a repository interface with `mock()` stub methods (so calls can
 * be asserted), merged with per-test overrides. Services take repositories via
 * constructor injection, so a test just does `new XServiceImpl(mockRepo, …)` —
 * no DI container needed.
 */
import { mock } from "bun:test";
import type { MaterialRepository } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { AssemblyRepository } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettingsRepository } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";
import type { ProjectRepository } from "../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import type { EstimateRepository } from "../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { JobRepository } from "../data-access/repositories/JobRepository/JobRepository.ts";
import type { ObjectStorage } from "../integrations/storage/ObjectStorage.ts";
import type { CompanyProfileRepository } from "../data-access/repositories/CompanyProfileRepository/CompanyProfileRepository.ts";
import { makeCompanyProfile } from "./factories.ts";

export const makeMaterialRepoMock = (
  over: Partial<MaterialRepository> = {},
): MaterialRepository => ({
  findByOrg: mock(async () => []),
  findById: mock(async () => null),
  findByIds: mock(async () => []),
  create: mock(async () => {
    throw new Error("not stubbed: MaterialRepository.create");
  }),
  update: mock(async () => null),
  deleteById: mock(async () => {}),
  upsertBySeedKey: mock(async () => {
    throw new Error("not stubbed: MaterialRepository.upsertBySeedKey");
  }),
  ...over,
});

export const makeAssemblyRepoMock = (
  over: Partial<AssemblyRepository> = {},
): AssemblyRepository => ({
  findByOrg: mock(async () => []),
  findById: mock(async () => null),
  create: mock(async () => {
    throw new Error("not stubbed: AssemblyRepository.create");
  }),
  update: mock(async () => null),
  deleteById: mock(async () => {}),
  upsertBySeedKey: mock(async () => {
    throw new Error("not stubbed: AssemblyRepository.upsertBySeedKey");
  }),
  ...over,
});

export const makePricingSettingsRepoMock = (
  over: Partial<PricingSettingsRepository> = {},
): PricingSettingsRepository => ({
  get: mock(async () => null),
  upsert: mock(async () => {
    throw new Error("not stubbed: PricingSettingsRepository.upsert");
  }),
  ...over,
});

export const makeProjectRepoMock = (
  over: Partial<ProjectRepository> = {},
): ProjectRepository => ({
  findByOrg: mock(async () => []),
  findById: mock(async () => null),
  countByClient: mock(async () => 0),
  create: mock(async () => {
    throw new Error("not stubbed: ProjectRepository.create");
  }),
  update: mock(async () => null),
  deleteById: mock(async () => {}),
  ...over,
});

export const makeEstimateRepoMock = (
  over: Partial<EstimateRepository> = {},
): EstimateRepository => ({
  findByProject: mock(async () => []),
  findById: mock(async () => null),
  create: mock(async () => {
    throw new Error("not stubbed: EstimateRepository.create");
  }),
  updateMeta: mock(async () => null),
  replaceSnapshot: mock(async () => null),
  deleteById: mock(async () => {}),
  ...over,
});

export const makeJobRepoMock = (
  over: Partial<JobRepository> = {},
): JobRepository => ({
  enqueuePending: mock(async () => {
    throw new Error("not stubbed: JobRepository.enqueuePending");
  }),
  markRunning: mock(async () => null),
  markSucceeded: mock(async () => null),
  markFailed: mock(async () => null),
  findByKey: mock(async () => null),
  findForOrg: mock(async () => null),
  findByStatus: mock(async () => []),
  ...over,
});

/**
 * In-memory ObjectStorage for handler and service tests. Records what was put so
 * a test can assert the key and bytes without touching a filesystem or GCS.
 */
export const makeObjectStorageFake = (
  over: Partial<ObjectStorage> = {},
): ObjectStorage & {
  objects: Map<string, { bytes: Uint8Array; contentType: string }>;
} => {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    objects,
    put: mock(async (key: string, bytes: Uint8Array, contentType: string) => {
      objects.set(key, { bytes, contentType });
    }),
    get: mock(async (key: string) => {
      const found = objects.get(key);
      if (!found) {
        throw new Error(`no object at ${key}`);
      }
      return found.bytes;
    }),
    head: mock(async (key: string) => {
      const found = objects.get(key);
      return found
        ? { contentType: found.contentType, byteSize: found.bytes.byteLength }
        : null;
    }),
    remove: mock(async (key: string) => {
      objects.delete(key);
    }),
    signedDownloadUrl: mock(async (key: string) => `https://signed.test/${key}`),
    signedUploadUrl: mock(async (key: string) => `https://upload.test/${key}`),
    ...over,
  };
};

export const makeCompanyProfileRepoMock = (
  over: Partial<CompanyProfileRepository> = {},
): CompanyProfileRepository => ({
  get: mock(async () => null),
  ensure: mock(async () => makeCompanyProfile()),
  update: mock(async () => makeCompanyProfile()),
  ...over,
});
