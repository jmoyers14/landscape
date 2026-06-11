import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container } from "tsyringe";
import { ITEM_REPOSITORY_TOKEN } from "./tokens.ts";
import { ItemRepositoryImpl } from "./repositories/ItemRepositoryImpl.ts";

// Register every repository as a process-wide singleton. Importing this module
// wires up the data-access layer; the service composition root pulls it in.
container.registerSingleton(ITEM_REPOSITORY_TOKEN, ItemRepositoryImpl);

export { connectDatabase } from "./connection.ts";
export * from "./tokens.ts";
