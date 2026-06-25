import { z } from "zod";
import { orgProtectedProcedure, router } from "../trpc.ts";

const laborRateInput = z.object({
  key: z.string().min(1),
  label: z.string(),
  rate: z.number().min(0),
});

const pricingSettingsInput = z.object({
  taxRate: z.number().min(0),
  overheadRate: z.number().min(0),
  profitRate: z.number().min(0),
  laborRates: z.array(laborRateInput),
});

export const pricingSettingsRouter = router({
  get: orgProtectedProcedure.query(({ ctx }) =>
    ctx.services.pricingSettingsService.get(ctx.auth.orgId),
  ),

  update: orgProtectedProcedure
    .input(pricingSettingsInput)
    .mutation(({ ctx, input }) =>
      ctx.services.pricingSettingsService.update(ctx.auth.orgId, input),
    ),
});
