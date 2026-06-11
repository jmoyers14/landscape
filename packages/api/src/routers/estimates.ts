import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const lineItemInput = z.object({
  phase: z.string().nullable().default(null),
  type: z.enum(["material", "labor", "equipment", "other"]),
  description: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().nullable().default(null),
  unitPrice: z.number().min(0),
});

const metaInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  status: z.enum(["draft", "sent", "accepted"]).optional(),
  overheadRate: z.number().min(0).optional(),
  profitRate: z.number().min(0).optional(),
  taxRate: z.number().min(0).optional(),
});

export const estimatesRouter = router({
  listByProject: orgProtectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.estimateService.listByProject(ctx.auth.orgId, input.projectId),
    ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.estimateService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(
      z.object({ projectId: z.string().min(1), title: z.string().optional() }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.create(
        ctx.auth.orgId,
        input.projectId,
        input.title,
      ),
    ),

  updateMeta: orgProtectedProcedure
    .input(metaInput)
    .mutation(({ ctx, input }) => {
      const { id, ...changes } = input;
      return ctx.services.estimateService.updateMeta(ctx.auth.orgId, id, changes);
    }),

  addLineItem: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1), item: lineItemInput }))
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.addLineItem(
        ctx.auth.orgId,
        input.id,
        input.item,
      ),
    ),

  updateLineItem: orgProtectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        lineItemId: z.string().min(1),
        item: lineItemInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.updateLineItem(
        ctx.auth.orgId,
        input.id,
        input.lineItemId,
        input.item,
      ),
    ),

  removeLineItem: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1), lineItemId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.removeLineItem(
        ctx.auth.orgId,
        input.id,
        input.lineItemId,
      ),
    ),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.remove(ctx.auth.orgId, input.id),
    ),
});
