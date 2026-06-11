import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

// Every procedure is org-scoped: orgId comes from the verified token, never the
// client, so a caller can only ever touch their own organization's items.
export const itemsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) => {
    return ctx.services.itemService.list(ctx.auth.orgId);
  }),

  create: orgProtectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.services.itemService.create(ctx.auth.orgId, input.name);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.services.itemService.remove(ctx.auth.orgId, input.id);
    }),
});
