/**
 * Contract surface of the shared backend layer: tokens, ports, and entity/input
 * types — no values that pull in Mongoose or SDKs. Safe for type-only consumers
 * (the web client resolves these through the tRPC AppRouter type). Server-only
 * values (registerServerCore, connectDatabase) live in ./server.ts.
 */

// Config
export { CONFIG_SERVICE_TOKEN } from "./config/tokens.ts";
export * from "./config/ConfigService.ts";

// Data-access: tokens and repository ports (each re-exports its own entity/input
// types).
export * from "./data-access/tokens.ts";
export * from "./data-access/repositories/ClientRepository/ClientRepository.ts";
export * from "./data-access/repositories/ProjectRepository/ProjectRepository.ts";
export * from "./data-access/repositories/EstimateRepository/EstimateRepository.ts";
export * from "./data-access/repositories/MaterialRepository/MaterialRepository.ts";
export * from "./data-access/repositories/AssemblyRepository/AssemblyRepository.ts";
export * from "./data-access/repositories/PricingSettingsRepository/PricingSettingsRepository.ts";

// Integrations: tokens and vendor-neutral ports.
export * from "./integrations/tokens.ts";
export * from "./integrations/auth/AuthClient.ts";
export * from "./integrations/maps/MapsClient.ts";
export * from "./integrations/analytics/AnalyticsClient.ts";
