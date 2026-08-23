import { Schema, model } from "mongoose";

/**
 * One unit of background work and the record of how it went. Generic: a webhook
 * fan-out, an org seed, and a PDF render are all rows here, distinguished by
 * `jobType`.
 *
 * Not org-scoped at the schema level — `syncUser` genuinely has no org, so
 * `orgId` is nullable. Tenant safety therefore lives in the repository's method
 * signatures (`findForOrg` takes an orgId; there is no unscoped find-by-id),
 * the same discipline Estimate, Client, Project and Material already run on.
 */
const jobSchema = new Schema(
  {
    jobType: { type: String, required: true },
    // The caller-computed content key. Its shape is per job type: a webhook job
    // uses "{source}:{sourceEventId}", a render job
    // "estimate:{id}:{updatedAtMillis}:{formulaVersion}".
    dedupKey: { type: String, required: true },
    orgId: { type: String, default: null },
    // Mixed on purpose: each handler zod-validates the shape it needs at its own
    // boundary rather than the schema constraining every job type at once.
    payload: { type: Schema.Types.Mixed, default: null },
    // What the handler returned. `{ storageKey, byteSize }` for a render job —
    // this is what a download link reads.
    result: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      required: true,
      enum: ["pending", "running", "succeeded", "failed"],
      default: "pending",
    },
    // Incremented by the worker on each run, not by the queue. Cloud Tasks sends
    // its own retry count in a header; the two disagreeing is itself a signal.
    attempts: { type: Number, required: true, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

// The dedup key. jobType is part of it because one trigger legitimately produces
// several jobs — an estimate PDF and a parts order share a dedupKey and differ
// only by type.
jobSchema.index({ jobType: 1, dedupKey: 1 }, { unique: true });
// Operational queries: what's stuck, what failed, what needs a manual retry.
jobSchema.index({ status: 1, updatedAt: -1 });

export const JobModel = model("Job", jobSchema);
