/**
 * Dependency-injection tokens for repositories. Kept in their own side-effect-
 * free module (mirroring services/tokens.ts) so consumers can import a token
 * without triggering DI registration or pulling Mongoose into their compile.
 */
export const CLIENT_REPOSITORY_TOKEN = "ClientRepository";
export const PROJECT_REPOSITORY_TOKEN = "ProjectRepository";
export const ESTIMATE_REPOSITORY_TOKEN = "EstimateRepository";
