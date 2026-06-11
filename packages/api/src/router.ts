import { router } from "./trpc.ts";
import { greetingRouter } from "./routers/greeting.ts";

export const appRouter = router({
  greeting: greetingRouter,
});

export type AppRouter = typeof appRouter;
