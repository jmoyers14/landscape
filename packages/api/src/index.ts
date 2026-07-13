import cors from "cors";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import { container, CONFIG_SERVICE_TOKEN } from "./services/index.ts";
import { ANALYTICS_CLIENT_TOKEN } from "@landscape/platform";
import { connectDatabase } from "@landscape/platform/server";
import type { ConfigService } from "@landscape/platform";
import type { AnalyticsClient } from "@landscape/platform";

const main = async (): Promise<void> => {
  const configService = container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
  const { port, webUrl } = configService.getServer();

  await connectDatabase(configService.getDatabase().uri);
  console.log("Connected to MongoDB");

  const server = createHTTPServer({
    router: appRouter,
    createContext,
    middleware: cors({
      origin: webUrl,
      credentials: true,
    }),
  });

  server.listen(port);
  console.log(`API listening on http://localhost:${port}`);

  // Cloud Run sends SIGTERM before stopping the instance — flush buffered
  // analytics so the last batch of events isn't lost on shutdown.
  const analytics = container.resolve<AnalyticsClient>(ANALYTICS_CLIENT_TOKEN);
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, flushing analytics…`);
    await analytics.shutdown().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
};

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
