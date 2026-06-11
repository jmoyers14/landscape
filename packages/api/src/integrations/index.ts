import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import { AUTH_CLIENT_TOKEN } from "./tokens.ts";
import { ClerkClient } from "./auth/ClerkClient.ts";

// Bind each integration port to its vendor adapter. Importing this module wires
// up the integrations layer; the service composition root pulls it in.
container.registerSingleton(AUTH_CLIENT_TOKEN, ClerkClient);

export * from "./tokens.ts";
