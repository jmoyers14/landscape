import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

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
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.services.projectService.create(
        ctx.auth.orgId,
        input,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PROJECT_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { projectId: project.id, hasLocation: input.location != null },
      });
      return project;
    }),

  update: orgProtectedProcedure
    .input(updateInput)
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.services.projectService.update(ctx.auth.orgId, id, data);
    }),

  changeStatus: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(PROJECT_STATUSES) }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.services.projectService.changeStatus(
        ctx.auth.orgId,
        input.id,
        input.status,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.PROJECT_STATUS_CHANGED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { projectId: input.id, status: input.status },
      });
      return project;
    }),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.projectService.remove(ctx.auth.orgId, input.id),
    ),

  propertyImage: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.projectService.getPropertyImage(ctx.auth.orgId, input.id),
    ),
});
