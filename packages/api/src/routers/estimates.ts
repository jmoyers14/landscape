import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";
import { ANALYTICS_EVENTS } from "../analytics/events.ts";

// One chosen assembly: which one, and the driver values to generate it with.
// Omitted drivers fall back to the assembly's defaults in the service.
const selectAssemblyInput = z.object({
  assemblyId: z.string().min(1),
  driverValues: z.record(z.string(), z.number()).optional(),
});

const metaInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  status: z.enum(["draft", "sent", "accepted"]).optional(),
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
    .mutation(async ({ ctx, input }) => {
      const estimate = await ctx.services.estimateService.create(
        ctx.auth.orgId,
        input.projectId,
        input.title,
      );
      ctx.analytics.capture({
        event: ANALYTICS_EVENTS.ESTIMATE_CREATED,
        distinctId: ctx.auth.userId,
        groupId: ctx.auth.orgId,
        properties: { estimateId: estimate.id, projectId: input.projectId },
      });
      return estimate;
    }),

  updateMeta: orgProtectedProcedure
    .input(metaInput)
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const estimate = await ctx.services.estimateService.updateMeta(
        ctx.auth.orgId,
        id,
        changes,
      );
      // Status is the sales-progression signal worth its own event; other meta
      // edits (title, rates) aren't funnel-relevant.
      if (changes.status) {
        ctx.analytics.capture({
          event: ANALYTICS_EVENTS.ESTIMATE_STATUS_CHANGED,
          distinctId: ctx.auth.userId,
          groupId: ctx.auth.orgId,
          properties: { estimateId: id, status: changes.status },
        });
      }
      return estimate;
    }),

  setAssemblies: orgProtectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        assemblies: z.array(selectAssemblyInput),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.setAssemblies(
        ctx.auth.orgId,
        input.id,
        input.assemblies,
      ),
    ),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.estimateService.remove(ctx.auth.orgId, input.id),
    ),
});
