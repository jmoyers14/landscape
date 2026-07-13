/**
 * Server-only surface: values that pull in Mongoose/SDKs and DI registration.
 * Kept apart from the contract barrel (./index.ts) so type-only consumers (the
 * web client, via the tRPC AppRouter type) never drag server implementations —
 * decorated adapters, Mongoose — into their compile.
 */
export { registerServerCore } from "./registerServerCore.ts";
export { connectDatabase } from "./data-access/connection.ts";
