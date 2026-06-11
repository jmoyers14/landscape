import { router } from "./trpc.ts";
import { greetingRouter } from "./routers/greeting.ts";
import { authRouter } from "./routers/auth.ts";

export const appRouter = router({
  greeting: greetingRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
