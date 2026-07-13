import cors from "cors";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import { container } from "./services/index.ts";
import { SERVER_CONFIG_TOKEN, type ServerConfig } from "./config/serverConfig.ts";
import { ANALYTICS_CLIENT_TOKEN } from "@landscape/platform";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  type DatabaseConfig,
} from "@landscape/platform/server";
import type { AnalyticsClient } from "@landscape/platform";

const main = async (): Promise<void> => {
  const { port, webUrl } = container.resolve<ServerConfig>(SERVER_CONFIG_TOKEN);
  const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);

  await connectDatabase(uri);
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
