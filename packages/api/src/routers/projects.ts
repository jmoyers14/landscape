import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const PROJECT_STATUSES = [
  "lead",
  "estimating",
  "won",
  "lost",
  "in_progress",
  "completed",
] as const;

const createInput = z.object({
  name: z.string().min(1),
  location: z.string().nullable().default(null),
  clientId: z.string().min(1),
  description: z.string().nullable().default(null),
});

const updateInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const projectsRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.projectService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.projectService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(createInput)
    .mutation(({ ctx, input }) =>
      ctx.services.projectService.create(ctx.auth.orgId, input),
    ),

  update: orgProtectedProcedure
    .input(updateInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.projectService.update(ctx.auth.orgId, id, data);
    }),

  changeStatus: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(PROJECT_STATUSES) }))
    .mutation(({ ctx, input }) =>
      ctx.services.projectService.changeStatus(
        ctx.auth.orgId,
        input.id,
        input.status,
      ),
    ),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.projectService.remove(ctx.auth.orgId, input.id),
    ),
});
