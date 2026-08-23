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
  DOCUMENT_JOB_SERVICE_TOKEN,
  COMPANY_PROFILE_SERVICE_TOKEN,
} from "./services/index.ts";
import {
  ANALYTICS_CLIENT_TOKEN,
  APP_CONFIG_TOKEN,
  LOGGER_TOKEN,
} from "@landscape/platform";
import type { Logger } from "@landscape/platform";
import type { ClientService } from "./services/ClientService/ClientService.ts";
import type { ProjectService } from "./services/ProjectService/ProjectService.ts";
import type { EstimateService } from "./services/EstimateService/EstimateService.ts";
import type { AddressService } from "./services/AddressService/AddressService.ts";
import type { PricingSettingsService } from "./services/PricingSettingsService/PricingSettingsService.ts";
import type { MaterialService } from "./services/MaterialService/MaterialService.ts";
import type { AssemblyService } from "./services/AssemblyService/AssemblyService.ts";
import type { DocumentJobService } from "./services/DocumentJobService/DocumentJobService.ts";
import type { CompanyProfileService } from "./services/CompanyProfileService/CompanyProfileService.ts";
import type { AuthService } from "./services/AuthService/AuthService.ts";
import type { AppConfig, AnalyticsClient } from "@landscape/platform";
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

  // One correlating id per request, plus the caller's org/user once known, plus
  // the GCP trace id (the part before "/" in X-Cloud-Trace-Context) so a
  // request's log lines group together in Cloud Logging.
  const log = container.resolve<Logger>(LOGGER_TOKEN).child({
    requestId: crypto.randomUUID(),
    orgId: auth?.orgId ?? null,
    userId: auth?.userId ?? null,
    trace: traceIdFrom(opts.req.headers["x-cloud-trace-context"]),
  });

  return {
    auth,
    log,
    analytics: container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN),
    appConfig: container.resolve<AppConfig>(APP_CONFIG_TOKEN),
    services: {
      clientService: container.resolve<ClientService>(CLIENT_SERVICE_TOKEN),
      projectService: container.resolve<ProjectService>(PROJECT_SERVICE_TOKEN),
      estimateService: container.resolve<EstimateService>(
        ESTIMATE_SERVICE_TOKEN,
      ),
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
      documentJobService: container.resolve<DocumentJobService>(
        DOCUMENT_JOB_SERVICE_TOKEN,
      ),
      companyProfileService: container.resolve<CompanyProfileService>(
        COMPANY_PROFILE_SERVICE_TOKEN,
      ),
    },
  };
}

/**
 * The trace id from an `X-Cloud-Trace-Context` header (`TRACE_ID/SPAN_ID;o=1`),
 * or null. Attached as a plain field for now; full Cloud Trace correlation would
 * emit `logging.googleapis.com/trace: projects/<id>/traces/<traceId>`, which
 * needs the project id — a later refinement.
 */
function traceIdFrom(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  return value ? (value.split("/")[0] ?? null) : null;
}
