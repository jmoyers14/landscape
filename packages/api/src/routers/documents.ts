import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const estimateInput = z.object({ estimateId: z.string().min(1) });

/**
 * Asynchronous document generation. Each request returns immediately with a job
 * id — and, when the document already exists for this exact estimate version, a
 * download URL in the same response.
 */
export const documentsRouter = router({
  requestEstimatePdf: orgProtectedProcedure
    .input(estimateInput)
    .mutation(({ ctx, input }) =>
      ctx.services.documentJobService.requestEstimatePdf(
        ctx.auth.orgId,
        input.estimateId,
      ),
    ),

  requestPartsOrderPdf: orgProtectedProcedure
    .input(estimateInput)
    .mutation(({ ctx, input }) =>
      ctx.services.documentJobService.requestPartsOrderPdf(
        ctx.auth.orgId,
        input.estimateId,
      ),
    ),

  // Polled by the client while a job is pending or running.
  status: orgProtectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ ctx, input }) =>
      ctx.services.documentJobService.status(ctx.auth.orgId, input.jobId),
    ),
});
