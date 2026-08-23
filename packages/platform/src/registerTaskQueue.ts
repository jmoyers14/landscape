import "reflect-metadata"; // MUST be imported before any decorated class is used
import { instanceCachingFactory, type DependencyContainer } from "tsyringe";
import { APP_CONFIG_TOKEN, type AppConfig } from "./config/appConfig.ts";
import {
  TASKS_CONFIG_TOKEN,
  loadTasksConfig,
} from "./integrations/tasks/tasksConfig.ts";
import { CloudTasksQueue } from "./integrations/tasks/CloudTasksQueue.ts";
import { InlineTaskQueue } from "./integrations/tasks/InlineTaskQueue.ts";
import { TASK_QUEUE_TOKEN } from "./integrations/tokens.ts";

/**
 * Registers the async job queue. Split out of registerWebhookCore because the
 * API now enqueues too (document renders) while still having no business with
 * webhook verification — the same all-or-nothing coupling the per-slice config
 * work removed.
 *
 * Imported from its own entry, NOT the /server barrel, because it statically
 * pulls the Cloud Tasks + google-auth SDKs.
 *
 * Call AFTER registerServerCore: the adapter choice reads AppConfig.
 */
export function registerTaskQueue(container: DependencyContainer): void {
  container.register(TASKS_CONFIG_TOKEN, {
    useFactory: instanceCachingFactory(() => loadTasksConfig()),
  });

  // Environment picks the queue. Resolved lazily inside the factory so the Cloud
  // Tasks config is only validated when that adapter is actually chosen — local
  // dev must not be made to supply a GCP project id.
  container.register(TASK_QUEUE_TOKEN, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const { environment } =
        dependencyContainer.resolve<AppConfig>(APP_CONFIG_TOKEN);
      return environment === "local"
        ? dependencyContainer.resolve(InlineTaskQueue)
        : dependencyContainer.resolve(CloudTasksQueue);
    }),
  });
}
