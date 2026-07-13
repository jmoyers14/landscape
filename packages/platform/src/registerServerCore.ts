import "reflect-metadata"; // MUST be imported before any decorated class is used
import type { DependencyContainer } from "tsyringe";
import { CONFIG_SERVICE_TOKEN } from "./config/tokens.ts";
import { ConfigServiceImpl } from "./config/ConfigServiceImpl.ts";
import {
  CLIENT_REPOSITORY_TOKEN,
  ESTIMATE_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
  ASSEMBLY_REPOSITORY_TOKEN,
  PRICING_SETTINGS_REPOSITORY_TOKEN,
} from "./data-access/tokens.ts";
import { ClientRepositoryImpl } from "./data-access/repositories/ClientRepository/ClientRepositoryImpl.ts";
import { ProjectRepositoryImpl } from "./data-access/repositories/ProjectRepository/ProjectRepositoryImpl.ts";
import { EstimateRepositoryImpl } from "./data-access/repositories/EstimateRepository/EstimateRepositoryImpl.ts";
import { MaterialRepositoryImpl } from "./data-access/repositories/MaterialRepository/MaterialRepositoryImpl.ts";
import { AssemblyRepositoryImpl } from "./data-access/repositories/AssemblyRepository/AssemblyRepositoryImpl.ts";
import { PricingSettingsRepositoryImpl } from "./data-access/repositories/PricingSettingsRepository/PricingSettingsRepositoryImpl.ts";
import {
  AUTH_CLIENT_TOKEN,
  MAPS_CLIENT_TOKEN,
  ANALYTICS_CLIENT_TOKEN,
} from "./integrations/tokens.ts";
import { ClerkClient } from "./integrations/auth/ClerkClient.ts";
import { GoogleMapsClient } from "./integrations/maps/GoogleMapsClient.ts";
import { PostHogClient } from "./integrations/analytics/PostHogClient.ts";

/**
 * Wires the shared backend (config, repositories, integration adapters) into a
 * DI container. Called explicitly by each entrypoint's composition root rather
 * than relying on import-time side effects, so a process only registers what it
 * asks for. Every binding is a process-wide singleton.
 */
export function registerServerCore(container: DependencyContainer): void {
  container.registerSingleton(CONFIG_SERVICE_TOKEN, ConfigServiceImpl);

  container.registerSingleton(CLIENT_REPOSITORY_TOKEN, ClientRepositoryImpl);
  container.registerSingleton(PROJECT_REPOSITORY_TOKEN, ProjectRepositoryImpl);
  container.registerSingleton(ESTIMATE_REPOSITORY_TOKEN, EstimateRepositoryImpl);
  container.registerSingleton(MATERIAL_REPOSITORY_TOKEN, MaterialRepositoryImpl);
  container.registerSingleton(ASSEMBLY_REPOSITORY_TOKEN, AssemblyRepositoryImpl);
  container.registerSingleton(
    PRICING_SETTINGS_REPOSITORY_TOKEN,
    PricingSettingsRepositoryImpl,
  );

  container.registerSingleton(AUTH_CLIENT_TOKEN, ClerkClient);
  container.registerSingleton(MAPS_CLIENT_TOKEN, GoogleMapsClient);
  container.registerSingleton(ANALYTICS_CLIENT_TOKEN, PostHogClient);
}
