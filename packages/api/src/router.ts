import { router } from "./trpc.ts";
import { clientsRouter } from "./routers/clients.ts";
import { projectsRouter } from "./routers/projects.ts";
import { estimatesRouter } from "./routers/estimates.ts";
import { authRouter } from "./routers/auth.ts";

export const appRouter = router({
  clients: clientsRouter,
  projects: projectsRouter,
  estimates: estimatesRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
