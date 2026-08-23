import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "./config/appConfig.ts";
import {
  CLERK_WEBHOOK_CONFIG_TOKEN,
  loadClerkWebhookConfig,
} from "./integrations/webhooks/clerkWebhookConfig.ts";
import { ClerkWebhookVerifier } from "./integrations/webhooks/ClerkWebhookVerifier.ts";
import { AllowAllTaskAuthenticator } from "./integrations/tasks/AllowAllTaskAuthenticator.ts";
import { GoogleOidcTaskAuthenticator } from "./integrations/tasks/GoogleOidcTaskAuthenticator.ts";
import { registerTaskQueue } from "./registerTaskQueue.ts";
import {
  CLERK_WEBHOOK_VERIFIER_TOKEN,
  TASK_AUTHENTICATOR_TOKEN,
} from "./integrations/tokens.ts";

/**
 * Registers the webhook-ingestion collaborators: signature verification and the
 * async job queue.
 *
 * Split out from registerServerCore because only the worker needs any of it.
 * The API would otherwise be forced to supply a webhook signing secret and GCP
 * queue settings it never uses — the same all-or-nothing coupling the per-slice
 * config work removed. Keeping it opt-in means each process validates exactly
 * the env it actually reads.
 *
 * Call AFTER registerServerCore: the TaskQueue choice reads AppConfig, which
 * that function registers.
 */
export function registerWebhookCore(container: DependencyContainer): void {
  container.register(CLERK_WEBHOOK_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadClerkWebhookConfig()),
  });
  container.registerSingleton(
    CLERK_WEBHOOK_VERIFIER_TOKEN,
    ClerkWebhookVerifier,
  );

  // The queue itself is no longer webhook-specific — the API enqueues document
  // renders through the same port — so it registers from its own module. The
  // worker still gets it by calling this, since ingestion needs both halves.
  registerTaskQueue(container);

  // The /tasks/* guard, chosen the same way and in lockstep with the queue:
  // local's loopback InlineTaskQueue pairs with allow-all (no token exists to
  // check), and every real environment pairs the CloudTasksQueue with OIDC
  // verification. Lazy, so local never has to supply the GCP tasks config the
  // OIDC verifier reads.
  container.register(TASK_AUTHENTICATOR_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } =
        dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(AllowAllTaskAuthenticator)
        : dependencyContainer.resolve(GoogleOidcTaskAuthenticator);
    }),
  });
}
