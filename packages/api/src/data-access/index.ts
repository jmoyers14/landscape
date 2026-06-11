import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import {
  CLIENT_REPOSITORY_TOKEN,
  PROJECT_REPOSITORY_TOKEN,
} from "./tokens.ts";
import { ClientRepositoryImpl } from "./repositories/ClientRepositoryImpl.ts";
import { ProjectRepositoryImpl } from "./repositories/ProjectRepositoryImpl.ts";

// Register every repository as a process-wide singleton. Importing this module
// wires up the data-access layer; the service composition root pulls it in.
container.registerSingleton(CLIENT_REPOSITORY_TOKEN, ClientRepositoryImpl);
container.registerSingleton(PROJECT_REPOSITORY_TOKEN, ProjectRepositoryImpl);

export { connectDatabase } from "./connection.ts";
export * from "./tokens.ts";
