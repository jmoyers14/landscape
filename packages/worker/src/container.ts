import "reflect-metadata"; // MUST be imported before any decorated class is used
import { container as rootContainer, instanceCachingFactory } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "@landscape/platform";
import { registerServerCore, registerWebhookCore } from "@landscape/platform/server";
import { WORKER_CONFIG_TOKEN, loadWorkerConfig } from "./config/workerConfig.ts";
import { TASK_AUTHENTICATOR_TOKEN } from "./tasks/TaskAuthenticator.ts";
import { AllowAllTaskAuthenticator } from "./tasks/AllowAllTaskAuthenticator.ts";

/**
 * This entrypoint's composition root. Registrations go on a *child* container
 * rather than tsyringe's global one so two entrypoints in the same process (or
 * test run) can't see each other's bindings.
 *
 * The worker resolves both cores:
 *  - registerServerCore — repositories + config the whole app shares.
 *  - registerWebhookCore — the background-job infrastructure only this
 *    entrypoint needs: the task queue (generic — any future job kind reuses it)
 *    and the Clerk webhook verifier (specific to the webhook workload). Keeping
 *    it off the API is what stops the API from having to supply a webhook
 *    signing secret and GCP queue settings it never uses.
 *
 * Config slices are lazy caching factories, so booting reads no env — each slice
 * validates the first time it's resolved.
 */
const container = rootContainer.createChildContainer();

registerServerCore(container);
registerWebhookCore(container);

container.register(WORKER_CONFIG_TOKEN, {
  useFactory: instanceCachingFactory(() => loadWorkerConfig()),
});

// Guard for /tasks/*. Chosen by environment, and it FAILS CLOSED: outside local
// the real OIDC verifier isn't wired yet (c2b), so rather than fall back to
// allow-all — which would expose the job endpoints on a public service — the
// factory throws, and the worker refuses to boot. Local uses allow-all because
// there's no queue and no token to check.
container.register(TASK_AUTHENTICATOR_TOKEN, {
  useFactory: instanceCachingFactory((dependencyContainer) => {
    const { environment } = dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
    if (environment === "local") {
      return dependencyContainer.resolve(AllowAllTaskAuthenticator);
    }
    throw new Error(
      `No /tasks authenticator for environment=${environment}. ` +
        "OIDC verification is not implemented yet (c2b); refusing to boot with the job endpoints unguarded.",
    );
  }),
});

export { container };
