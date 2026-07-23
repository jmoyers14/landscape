import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container as rootContainer, instanceCachingFactory } from "tsyringe";
import { registerServerCore } from "@landscape/platform/server";
import { WORKER_CONFIG_TOKEN, loadWorkerConfig } from "./config/workerConfig.ts";

/**
 * This entrypoint's composition root. Registrations go on a *child* container
 * rather than tsyringe's global one so that two entrypoints in the same test
 * process (or a future in-process harness) can't see each other's bindings —
 * the API's request-scoped services and the worker's handlers stay disjoint.
 *
 * Config slices registered by registerServerCore are lazy caching factories, so
 * booting this container reads no env. The worker only ever validates the slices
 * it actually resolves — it never needs the API's WEB_URL, for instance.
 */
const container = rootContainer.createChildContainer();

registerServerCore(container);

container.register(WORKER_CONFIG_TOKEN, {
  useFactory: instanceCachingFactory(() => loadWorkerConfig()),
});

export { container };
