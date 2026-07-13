/**
 * Contract surface of the shared backend layer: tokens, ports, and entity/input
 * types — no values that pull in Mongoose or SDKs. Safe for type-only consumers
 * (the web client resolves these through the tRPC AppRouter type). Server-only
 * values (registerServerCore, connectDatabase) live in ./server.ts.
 */

// Config: the app-identity slice (environment + build stamp). AppConfig rides on
// the tRPC Context, so only its zod-free type module is exposed here. The other
// slices (database, clerk, maps, analytics) and the parse helper are server-only
// — they read env / call process.exit — so they stay off the contract barrel and
// never reach the web client.
export * from "./config/appConfig.ts";

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
