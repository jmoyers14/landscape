import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import {
  CLIENT_REPOSITORY_TOKEN,
  ESTIMATE_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
  ASSEMBLY_REPOSITORY_TOKEN,
  PRICING_SETTINGS_REPOSITORY_TOKEN,
} from "./tokens.ts";
import { ClientRepositoryImpl } from "./repositories/ClientRepository/ClientRepositoryImpl.ts";
import { ProjectRepositoryImpl } from "./repositories/ProjectRepository/ProjectRepositoryImpl.ts";
import { EstimateRepositoryImpl } from "./repositories/EstimateRepository/EstimateRepositoryImpl.ts";
import { MaterialRepositoryImpl } from "./repositories/MaterialRepository/MaterialRepositoryImpl.ts";
import { AssemblyRepositoryImpl } from "./repositories/AssemblyRepository/AssemblyRepositoryImpl.ts";
import { PricingSettingsRepositoryImpl } from "./repositories/PricingSettingsRepository/PricingSettingsRepositoryImpl.ts";

// Register every repository as a process-wide singleton. Importing this module
// wires up the data-access layer; the service composition root pulls it in.
container.registerSingleton(CLIENT_REPOSITORY_TOKEN, ClientRepositoryImpl);
container.registerSingleton(PROJECT_REPOSITORY_TOKEN, ProjectRepositoryImpl);
container.registerSingleton(ESTIMATE_REPOSITORY_TOKEN, EstimateRepositoryImpl);
container.registerSingleton(MATERIAL_REPOSITORY_TOKEN, MaterialRepositoryImpl);
container.registerSingleton(ASSEMBLY_REPOSITORY_TOKEN, AssemblyRepositoryImpl);
container.registerSingleton(
  PRICING_SETTINGS_REPOSITORY_TOKEN,
  PricingSettingsRepositoryImpl,
);

export { connectDatabase } from "./connection.ts";
export * from "./tokens.ts";
