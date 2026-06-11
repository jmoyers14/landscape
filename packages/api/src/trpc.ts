import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.ts";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Requires a verified Clerk session. Narrows ctx.auth to non-null for
 * downstream resolvers.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/**
 * Requires an active organization (the B2B tenant boundary). Narrows orgId to a
 * non-null string so org-scoped queries can rely on it.
 */
export const orgProtectedProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.auth.orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organization selected",
    });
  }
  return next({ ctx: { ...ctx, auth: { ...ctx.auth, orgId: ctx.auth.orgId } } });
});
