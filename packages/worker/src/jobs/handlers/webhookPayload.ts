import { z } from "zod";

/**
 * Every webhook-derived job stores its event pointer as the payload; the handler
 * resolves the raw event itself now that the runner is job-type agnostic.
 */
export const webhookPayloadSchema = z.object({
  source: z.enum(["clerk"]),
  sourceEventId: z.string().min(1),
});
