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
