import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const driverInput = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1),
  defaultValue: z.number(),
});

// A named grouping of work within the assembly; lines reference it by key.
const taskInput = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().default(0),
});

// Lines are a discriminated union on `kind`, matching the AssemblyLine domain
// type: a material line carries materialId/deliveriesFormula, a labor line
// carries laborRateKey. Both carry an optional taskKey (the group they belong
// to; null = ungrouped).
const materialLineInput = z.object({
  key: z.string().min(1),
  kind: z.literal("material"),
  description: z.string().min(1),
  quantityFormula: z.string().min(1),
  materialId: z.string().min(1),
  deliveriesFormula: z.string().nullable().default(null),
  taskKey: z.string().nullable().default(null),
  sortOrder: z.number().default(0),
});

const laborLineInput = z.object({
  key: z.string().min(1),
  kind: z.literal("labor"),
  description: z.string().min(1),
  quantityFormula: z.string().min(1),
  laborRateKey: z.string().min(1),
  taskKey: z.string().nullable().default(null),
  sortOrder: z.number().default(0),
});

const lineInput = z.discriminatedUnion("kind", [
  materialLineInput,
  laborLineInput,
]);

// No `source` here — the service controls that marker.
const assemblyInput = z.object({
  name: z.string().min(1),
  category: z.string().min(1).default("General"),
  description: z.string().nullable().default(null),
  sortOrder: z.number().default(0),
  active: z.boolean().default(true),
  drivers: z.array(driverInput),
  tasks: z.array(taskInput).default([]),
  lines: z.array(lineInput),
});

export const assembliesRouter = router({
  list: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.assemblyService.list(ctx.auth.orgId),
  ),

  get: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.assemblyService.get(ctx.auth.orgId, input.id),
    ),

  create: orgProtectedProcedure
    .input(assemblyInput)
    .mutation(({ ctx, input }) =>
      ctx.services.assemblyService.create(ctx.auth.orgId, input),
    ),

  update: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1), data: assemblyInput }))
    .mutation(({ ctx, input }) =>
      ctx.services.assemblyService.update(ctx.auth.orgId, input.id, input.data),
    ),

  remove: orgProtectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.assemblyService.remove(ctx.auth.orgId, input.id),
    ),

  // Read-only: priced line items + totals for an assembly at the given driver
  // values (saves nothing). Powers a "what does this cost" catalog preview.
  preview: orgProtectedProcedure
    .input(
      z.object({
        assemblyId: z.string().min(1),
        driverValues: z.record(z.string(), z.number()).default({}),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.assemblyService.preview(
        ctx.auth.orgId,
        input.assemblyId,
        input.driverValues,
      ),
    ),
});
