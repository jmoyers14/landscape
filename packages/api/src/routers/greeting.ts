import { z } from "zod";
import { publicProcedure, router } from "../trpc.ts";

export const greetingRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ ctx, input }) => {
      return { message: ctx.services.greetingService.greet(input.name) };
    }),

  list: publicProcedure.query(({ ctx }) => {
    return ctx.services.greetingService.list();
  }),

  add: publicProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.services.greetingService.add(input.message);
    }),
});
