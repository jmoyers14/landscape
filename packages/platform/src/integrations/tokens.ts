/**
 * Dependency-injection tokens for third-party integration clients. Side-effect-
 * free so a consumer can import a token without triggering DI registration or
 * pulling an SDK into its compile.
 */
export const AUTH_CLIENT_TOKEN = "AuthClient";
export const MAPS_CLIENT_TOKEN = "MapsClient";
export const ANALYTICS_CLIENT_TOKEN = "AnalyticsClient";
