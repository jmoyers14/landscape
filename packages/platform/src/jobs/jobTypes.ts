/**
 * The job kinds the worker knows how to run, and the queues they ride on.
 *
 * One module so four things can't drift apart: the router (event type → job),
 * the registry (job → handler), the queue names deploy.sh must create, and the
 * API — which enqueues document renders and so reads the same table. A job type
 * that isn't in `JOB_TYPES` has no handler; a queue not in `QUEUES` won't exist
 * in Cloud Tasks.
 *
 * It lives in platform rather than in the worker precisely because there are
 * now two entrypoints enqueuing: a job type that drifted between them would
 * route work to a handler that doesn't exist.
 */
export const JOB_TYPES = {
  SEED_ORG: "seedOrg",
  SYNC_USER: "syncUser",
  RENDER_ESTIMATE_PDF: "renderEstimatePdf",
  RENDER_PARTS_ORDER_PDF: "renderPartsOrderPdf",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * Queue per job kind, so retry/backoff/rate policy is tuned independently —
 * seeding an org catalog and mirroring a user record fail for different reasons
 * and deserve different retry behaviour.
 */
export const QUEUES = {
  ORG_SEED: "org-seed-queue",
  USER_SYNC: "user-sync-queue",
  // Both document kinds share one queue: they fail for the same reasons (a
  // render crash, a storage blip) and deserve the same retry policy.
  DOCUMENT_RENDER: "document-render-queue",
} as const;
