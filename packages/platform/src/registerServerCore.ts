import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN } from "./config/appConfig.ts";
import { loadAppConfig } from "./config/loadAppConfig.ts";
import { DATABASE_CONFIG_TOKEN } from "./data-access/databaseConfig.ts";
import { loadDatabaseConfig } from "./data-access/databaseConfig.ts";
import { CLERK_CONFIG_TOKEN, loadClerkConfig } from "./integrations/auth/clerkConfig.ts";
import { MAPS_CONFIG_TOKEN, loadMapsConfig } from "./integrations/maps/mapsConfig.ts";
import {
  ANALYTICS_CONFIG_TOKEN,
  loadAnalyticsConfig,
} from "./integrations/analytics/analyticsConfig.ts";
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
 * asks for.
 *
 * Config slices are registered as lazy caching factories: a slice's env is read
 * and validated the first time something resolves it, not at registration. So
 * an entrypoint that never resolves, say, the maps client never validates the
 * maps env — each process only pays for the config it actually uses.
 */
export function registerServerCore(container: DependencyContainer): void {
  container.register(APP_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAppConfig()),
  });
  container.register(DATABASE_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadDatabaseConfig()),
  });
  container.register(CLERK_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadClerkConfig()),
  });
  container.register(MAPS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadMapsConfig()),
  });
  container.register(ANALYTICS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadAnalyticsConfig()),
  });

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
