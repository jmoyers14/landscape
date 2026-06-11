/**
 * Dependency-injection tokens for repositories. Kept in their own side-effect-
 * free module (mirroring services/tokens.ts) so consumers can import a token
 * without triggering DI registration or pulling Mongoose into their compile.
 */
export const ITEM_REPOSITORY_TOKEN = "ItemRepository";
