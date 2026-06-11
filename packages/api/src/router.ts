import { router } from "./trpc.ts";
import { itemsRouter } from "./routers/items.ts";
import { authRouter } from "./routers/auth.ts";

export const appRouter = router({
  items: itemsRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
