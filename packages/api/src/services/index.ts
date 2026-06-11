import "reflect-metadata"; // MUST be imported before any decorated class is used
import "../data-access/index.ts"; // registers repositories the services depend on
import "../integrations/index.ts"; // registers integration clients (AuthClient, ...)
import { container } from "tsyringe";
import {
  CONFIG_SERVICE_TOKEN,
  AUTH_SERVICE_TOKEN,
  CLIENT_SERVICE_TOKEN,
  PROJECT_SERVICE_TOKEN,
  ESTIMATE_SERVICE_TOKEN,
} from "./tokens.ts";
import { ConfigServiceImpl } from "./ConfigService/ConfigServiceImpl.ts";
import { AuthServiceImpl } from "./AuthService/AuthServiceImpl.ts";
import { ClientServiceImpl } from "./ClientService/ClientServiceImpl.ts";
import { ProjectServiceImpl } from "./ProjectService/ProjectServiceImpl.ts";
import { EstimateServiceImpl } from "./EstimateService/EstimateServiceImpl.ts";

// registerSingleton: one shared instance for the process.
// register: a fresh instance per resolution.
container.registerSingleton(CONFIG_SERVICE_TOKEN, ConfigServiceImpl);
container.registerSingleton(AUTH_SERVICE_TOKEN, AuthServiceImpl);
container.registerSingleton(CLIENT_SERVICE_TOKEN, ClientServiceImpl);
container.registerSingleton(PROJECT_SERVICE_TOKEN, ProjectServiceImpl);
container.registerSingleton(ESTIMATE_SERVICE_TOKEN, EstimateServiceImpl);

export { container };
export * from "./tokens.ts";
