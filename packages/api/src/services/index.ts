import "reflect-metadata"; // MUST be imported before any decorated class is used
import "../data-access/index.ts"; // registers repositories the services depend on
import "../integrations/index.ts"; // registers integration clients (AuthClient, ...)
import { container } from "tsyringe";
import {
  CONFIG_SERVICE_TOKEN,
  ITEM_SERVICE_TOKEN,
  AUTH_SERVICE_TOKEN,
} from "./tokens.ts";
import { ConfigServiceImpl } from "./ConfigService/ConfigServiceImpl.ts";
import { ItemServiceImpl } from "./ItemService/ItemServiceImpl.ts";
import { AuthServiceImpl } from "./AuthService/AuthServiceImpl.ts";

// registerSingleton: one shared instance for the process.
// register: a fresh instance per resolution.
container.registerSingleton(CONFIG_SERVICE_TOKEN, ConfigServiceImpl);
container.registerSingleton(ITEM_SERVICE_TOKEN, ItemServiceImpl);
container.registerSingleton(AUTH_SERVICE_TOKEN, AuthServiceImpl);

export { container };
export * from "./tokens.ts";
