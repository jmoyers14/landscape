import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import {
  container,
  AUTH_SERVICE_TOKEN,
  CLIENT_SERVICE_TOKEN,
  PROJECT_SERVICE_TOKEN,
  ESTIMATE_SERVICE_TOKEN,
  ADDRESS_SERVICE_TOKEN,
  PRICING_SETTINGS_SERVICE_TOKEN,
  MATERIAL_SERVICE_TOKEN,
  ASSEMBLY_SERVICE_TOKEN,
} from "./services/index.ts";
import { ANALYTICS_CLIENT_TOKEN } from "./integrations/index.ts";
import type { ClientService } from "./services/ClientService/ClientService.ts";
import type { ProjectService } from "./services/ProjectService/ProjectService.ts";
import type { EstimateService } from "./services/EstimateService/EstimateService.ts";
import type { AddressService } from "./services/AddressService/AddressService.ts";
import type { PricingSettingsService } from "./services/PricingSettingsService/PricingSettingsService.ts";
import type { MaterialService } from "./services/MaterialService/MaterialService.ts";
import type { AssemblyService } from "./services/AssemblyService/AssemblyService.ts";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import type { AnalyticsClient } from "./integrations/analytics/AnalyticsClient.ts";
import type { Context } from "./context.ts";

/**
 * Runs per request. Authenticates the caller via AuthService and resolves the
 * services each procedure needs from the DI container. Lives apart from the
 * Context type so only the server entry imports the container.
 */
export async function createContext(
  opts: CreateHTTPContextOptions,
): Promise<Context> {
  const authService = container.resolve<AuthService>(AUTH_SERVICE_TOKEN);
  const auth = await authService.authenticate(opts.req.headers.authorization);

  return {
    auth,
    analytics: container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN),
    services: {
      clientService: container.resolve<ClientService>(CLIENT_SERVICE_TOKEN),
      projectService: container.resolve<ProjectService>(PROJECT_SERVICE_TOKEN),
      estimateService: container.resolve<EstimateService>(ESTIMATE_SERVICE_TOKEN),
      addressService: container.resolve<AddressService>(ADDRESS_SERVICE_TOKEN),
      pricingSettingsService: container.resolve<PricingSettingsService>(
        PRICING_SETTINGS_SERVICE_TOKEN,
      ),
      materialService: container.resolve<MaterialService>(
        MATERIAL_SERVICE_TOKEN,
      ),
      assemblyService: container.resolve<AssemblyService>(
        ASSEMBLY_SERVICE_TOKEN,
      ),
    },
  };
}
