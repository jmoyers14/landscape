/**
 * Dependency-injection tokens for third-party integration clients. Side-effect-
 * free so a consumer can import a token without triggering DI registration or
 * pulling an SDK into its compile.
 */
export const AUTH_CLIENT_TOKEN = "AuthClient";
export const MAPS_CLIENT_TOKEN = "MapsClient";
export const ANALYTICS_CLIENT_TOKEN = "AnalyticsClient";
export const TASK_QUEUE_TOKEN = "TaskQueue";
export const TASK_AUTHENTICATOR_TOKEN = "TaskAuthenticator";
// One verifier per webhook source, so the token is per-source too — a second
// source gets its own token and adapter rather than overloading this one.
export const CLERK_WEBHOOK_VERIFIER_TOKEN = "ClerkWebhookVerifier";
