import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const materialInput = z.object({
  name: z.string().min(1),
  category: z.string().min(1).default("General"),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  deliveryCost: z.number().min(0).default(0),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const materialsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.materialService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.materialService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(materialInput)
    .mutation(({ ctx, input }) =>
      ctx.services.materialService.create(ctx.auth.orgId, input),
    ),

  update: orgProtectedProcedure
    .input(materialInput.extend({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.materialService.update(ctx.auth.orgId, id, data);
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.materialService.remove(ctx.auth.orgId, input.id),
    ),
});
