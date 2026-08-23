import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const profileInput = z.object({
  businessName: z.string().max(200).optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  licenseNumber: z.string().max(100).nullable().optional(),
});

/** The org's business identity, as it appears at the head of every document. */
export const companyRouter = router({
  get: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.companyProfileService.get(ctx.auth.orgId),
  ),

  update: orgProtectedProcedure
    .input(profileInput)
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.update(ctx.auth.orgId, input),
    ),

  // Step 1 of the upload: the browser PUTs the file straight to storage with
  // this URL, so image bytes never pass through tRPC.
  requestLogoUpload: orgProtectedProcedure
    .input(z.object({ contentType: z.enum(["image/png", "image/jpeg"]) }))
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.requestLogoUpload(
        ctx.auth.orgId,
        input.contentType,
      ),
    ),

  // Step 2: the size check a signed URL can't make.
  confirmLogo: orgProtectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.companyProfileService.confirmLogo(ctx.auth.orgId, input.key),
    ),
});
