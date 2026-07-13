/**
 * Dependency-injection tokens. String tokens keep service interfaces decoupled
 * from their implementations — consumers depend on the interface + token, never
 * the concrete class.
 */
export const AUTH_SERVICE_TOKEN = "AuthService";
export const CLIENT_SERVICE_TOKEN = "ClientService";
export const PROJECT_SERVICE_TOKEN = "ProjectService";
export const ESTIMATE_SERVICE_TOKEN = "EstimateService";
export const ADDRESS_SERVICE_TOKEN = "AddressService";
export const PRICING_SETTINGS_SERVICE_TOKEN = "PricingSettingsService";
export const MATERIAL_SERVICE_TOKEN = "MaterialService";
export const ASSEMBLY_SERVICE_TOKEN = "AssemblyService";
