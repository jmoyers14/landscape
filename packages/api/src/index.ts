import mongoose from "mongoose";
import cors from "cors";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";
import { createContext } from "./createContext.ts";
import { container, CONFIG_SERVICE_TOKEN } from "./services/index.ts";
import type { ConfigService } from "./services/ConfigService/ConfigService.ts";

const main = async (): Promise<void> => {
  const configService = container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
  const { port, webUrl } = configService.getServer();

  await mongoose.connect(configService.getDatabase().uri);
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
};

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
