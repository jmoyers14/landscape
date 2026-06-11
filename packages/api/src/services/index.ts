import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import { CONFIG_SERVICE_TOKEN, GREETING_SERVICE_TOKEN } from "./tokens.ts";
import { ConfigServiceImpl } from "./ConfigService/ConfigServiceImpl.ts";
import { GreetingServiceImpl } from "./GreetingService/GreetingServiceImpl.ts";

// registerSingleton: one shared instance for the process.
// register: a fresh instance per resolution.
container.registerSingleton(CONFIG_SERVICE_TOKEN, ConfigServiceImpl);
container.registerSingleton(GREETING_SERVICE_TOKEN, GreetingServiceImpl);

export { container };
export * from "./tokens.ts";
