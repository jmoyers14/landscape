/**
 * Dependency-injection tokens. String tokens keep service interfaces decoupled
 * from their implementations — consumers depend on the interface + token, never
 * the concrete class.
 */
export const CONFIG_SERVICE_TOKEN = "ConfigService";
export const AUTH_SERVICE_TOKEN = "AuthService";
export const CLIENT_SERVICE_TOKEN = "ClientService";
export const PROJECT_SERVICE_TOKEN = "ProjectService";
export const ESTIMATE_SERVICE_TOKEN = "EstimateService";
