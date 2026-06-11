import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

// Optional contact fields default to null so the input type matches ClientInput.
const clientInput = z.object({
  name: z.string().min(1),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
});

export const clientsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.clientService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.clientService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(clientInput)
    .mutation(({ ctx, input }) =>
      ctx.services.clientService.create(ctx.auth.orgId, input),
    ),

  update: orgProtectedProcedure
    .input(clientInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.clientService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.clientService.remove(ctx.auth.orgId, input.id),
    ),
});
