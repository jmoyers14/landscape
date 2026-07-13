/**
 * Dependency-injection token for the configuration service. Kept in its own
 * side-effect-free module so a consumer can import the token without pulling the
 * config implementation (and its env parsing) into their compile.
 */
export const CONFIG_SERVICE_TOKEN = "ConfigService";
