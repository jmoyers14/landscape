import type { AuthIdentity } from "@landscape/domain";
import type { AnalyticsClient } from "@landscape/platform";
import type { ClientService } from "./services/ClientService/ClientService.ts";
import type { ProjectService } from "./services/ProjectService/ProjectService.ts";
import type { EstimateService } from "./services/EstimateService/EstimateService.ts";
import type { AddressService } from "./services/AddressService/AddressService.ts";
import type { PricingSettingsService } from "./services/PricingSettingsService/PricingSettingsService.ts";
import type { MaterialService } from "./services/MaterialService/MaterialService.ts";
import type { AssemblyService } from "./services/AssemblyService/AssemblyService.ts";
import type { AppConfig } from "@landscape/platform";

/**
 * Authenticated principal for a request — the provider-neutral identity the
 * AuthClient returns after verifying a session token. `orgId`/`orgRole` are
 * populated only when the user has an active organization (the tenant boundary
 * for this B2B app).
 */
export type AuthContext = AuthIdentity;

/**
 * Request context type. This module imports only service *interfaces* (no DI
 * container, decorators, or runtime globals) so the client can consume the
 * AppRouter type without pulling the server implementation into its compile.
 */
export interface Context {
  auth: AuthContext | null;
  /**
   * Product-analytics sink. Lives beside `services` rather than inside it
   * because capture is a cross-cutting side effect fired at the procedure
   * layer, not domain logic.
   */
  analytics: AnalyticsClient;
  /** Process-wide app identity (environment + build stamp). Read by the system router. */
  appConfig: AppConfig;
  services: {
    clientService: ClientService;
    projectService: ProjectService;
    estimateService: EstimateService;
    addressService: AddressService;
    pricingSettingsService: PricingSettingsService;
    materialService: MaterialService;
    assemblyService: AssemblyService;
  };
}
