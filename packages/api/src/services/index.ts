import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import { registerServerCore } from "@landscape/platform/server";
import {
  AUTH_SERVICE_TOKEN,
  CLIENT_SERVICE_TOKEN,
  PROJECT_SERVICE_TOKEN,
  ESTIMATE_SERVICE_TOKEN,
  ADDRESS_SERVICE_TOKEN,
  PRICING_SETTINGS_SERVICE_TOKEN,
  MATERIAL_SERVICE_TOKEN,
  ASSEMBLY_SERVICE_TOKEN,
} from "./tokens.ts";
import { AuthServiceImpl } from "./AuthService/AuthServiceImpl.ts";
import { ClientServiceImpl } from "./ClientService/ClientServiceImpl.ts";
import { ProjectServiceImpl } from "./ProjectService/ProjectServiceImpl.ts";
import { EstimateServiceImpl } from "./EstimateService/EstimateServiceImpl.ts";
import { AddressServiceImpl } from "./AddressService/AddressServiceImpl.ts";
import { PricingSettingsServiceImpl } from "./PricingSettingsService/PricingSettingsServiceImpl.ts";
import { MaterialServiceImpl } from "./MaterialService/MaterialServiceImpl.ts";
import { AssemblyServiceImpl } from "./AssemblyService/AssemblyServiceImpl.ts";

// Wire the shared backend (config, repositories, integration adapters) into the
// container, then register this entrypoint's request-scoped services on top.
// registerSingleton: one shared instance for the process.
registerServerCore(container);

container.registerSingleton(AUTH_SERVICE_TOKEN, AuthServiceImpl);
container.registerSingleton(CLIENT_SERVICE_TOKEN, ClientServiceImpl);
container.registerSingleton(PROJECT_SERVICE_TOKEN, ProjectServiceImpl);
container.registerSingleton(ESTIMATE_SERVICE_TOKEN, EstimateServiceImpl);
container.registerSingleton(ADDRESS_SERVICE_TOKEN, AddressServiceImpl);
container.registerSingleton(
  PRICING_SETTINGS_SERVICE_TOKEN,
  PricingSettingsServiceImpl,
);
container.registerSingleton(MATERIAL_SERVICE_TOKEN, MaterialServiceImpl);
container.registerSingleton(ASSEMBLY_SERVICE_TOKEN, AssemblyServiceImpl);

export { container };
// Re-exported so request-scoped code can resolve config from this composition
// root without importing the platform package directly.
export { CONFIG_SERVICE_TOKEN } from "@landscape/platform";
export * from "./tokens.ts";
