import { Schema, model } from "mongoose";

/**
 * One unit of work derived from a webhook event, and the record of how it went.
 * Separate from WebhookEvent because a single event can fan out to several jobs
 * — `user.created` both syncs the user record and sends a welcome email — and
 * each of those succeeds or fails on its own schedule.
 *
 * Not org-scoped, for the same reason as WebhookEvent. `orgId` is recorded when
 * the payload happens to carry one, purely so operational queries ("what failed
 * for this customer?") don't have to reach back into the raw payload.
 */
const webhookJobSchema = new Schema(
  {
    source: { type: String, required: true },
    sourceEventId: { type: String, required: true },
    jobType: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "succeeded", "failed"],
      default: "pending",
    },
    // Incremented by the worker on each run, not by the queue. Cloud Tasks also
    // sends its own retry count in a header; this is our independent count, so
    // the two disagreeing is itself a signal something is wrong.
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
    orgId: { type: String, default: null },
  },
  { timestamps: true },
);

// The dedup key. jobType is part of it precisely because one event legitimately
// produces several jobs — keying on (source, sourceEventId) alone would let the second
// job silently overwrite the first.
webhookJobSchema.index(
  { source: 1, sourceEventId: 1, jobType: 1 },
  { unique: true },
);
// Supports the operational queries this table exists for: what's stuck, what
// failed, what needs a manual retry.
webhookJobSchema.index({ status: 1, updatedAt: -1 });

export const WebhookJobModel = model("WebhookJob", webhookJobSchema);
