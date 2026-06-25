/**
 * Entity factories for tests. Each returns a plain data-access entity (the
 * object a repository hands back — see the "models = entities" convention) with
 * sensible defaults, merged with per-test overrides. Build starting points
 * here; override only the fields a test actually cares about.
 */
import type { Client } from "../data-access/repositories/ClientRepository/ClientRepository.ts";
import type { Project } from "../data-access/repositories/ProjectRepository/ProjectRepository.ts";
import type { Estimate } from "../data-access/repositories/EstimateRepository/EstimateRepository.ts";
import type { Material } from "../data-access/repositories/MaterialRepository/MaterialRepository.ts";
import type { Assembly } from "../data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
import type { PricingSettings } from "../data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";

const CREATED_AT = "2026-01-01T00:00:00.000Z";

export const makeClient = (over: Partial<Client> = {}): Client => ({
  id: "client_1",
  name: "Test Client",
  email: null,
  phone: null,
  address: null,
  createdAt: CREATED_AT,
  ...over,
});

export const makeProject = (over: Partial<Project> = {}): Project => ({
  id: "project_1",
  name: "Test Project",
  location: null,
  clientId: "client_1",
  description: null,
  status: "lead",
  createdAt: CREATED_AT,
  ...over,
});

export const makeEstimate = (over: Partial<Estimate> = {}): Estimate => ({
  id: "estimate_1",
  projectId: "project_1",
  title: "Estimate",
  status: "draft",
  overheadRate: 40,
  profitRate: 15,
  taxRate: 0,
  lineItems: [],
  createdAt: CREATED_AT,
  ...over,
});

export const makeMaterial = (over: Partial<Material> = {}): Material => ({
  id: "material_1",
  name: "Test Material",
  category: "General",
  unit: "unit(s)",
  unitPrice: 1,
  deliveryCost: 0,
  taxable: true,
  active: true,
  createdAt: CREATED_AT,
  ...over,
});

export const makeAssembly = (over: Partial<Assembly> = {}): Assembly => ({
  id: "assembly_1",
  name: "Test Assembly",
  category: "General",
  description: null,
  sortOrder: 0,
  active: true,
  drivers: [{ key: "qty", label: "Quantity", unit: "unit(s)", defaultValue: 1 }],
  lines: [],
  createdAt: CREATED_AT,
  ...over,
});

export const makePricingSettings = (
  over: Partial<PricingSettings> = {},
): PricingSettings => ({
  taxRate: 7.75,
  overheadRate: 40,
  profitRate: 15,
  laborRates: [
    { key: "general", label: "General labor", rate: 35 },
    { key: "skilled", label: "Skilled labor", rate: 55 },
  ],
  ...over,
});
