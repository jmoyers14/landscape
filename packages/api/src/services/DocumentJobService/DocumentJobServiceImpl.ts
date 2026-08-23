import { inject, injectable } from "tsyringe";
import { z } from "zod";
import { PRICING_FORMULA_VERSION } from "@landscape/domain";
import {
  ESTIMATE_REPOSITORY_TOKEN,
  JOB_REPOSITORY_TOKEN,
  JOB_TYPES,
  OBJECT_STORAGE_TOKEN,
  QUEUES,
  TASK_QUEUE_TOKEN,
  estimateDedupKey,
  taskName,
  type Estimate,
  type EstimateRepository,
  type Job,
  type JobRepository,
  type ObjectStorage,
  type TaskQueue,
} from "@landscape/platform";
import { ServiceError } from "../errors.ts";
import type {
  DocumentJobService,
  DocumentJobView,
} from "./DocumentJobService.ts";

/** The `result` a render handler records. Validated, not trusted. */
const renderResultSchema = z.object({
  storageKey: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
});

/** What the download is called once it reaches the user's disk. */
const FILENAME: Record<string, (estimate: Estimate) => string> = {
  [JOB_TYPES.RENDER_ESTIMATE_PDF]: (estimate) => `${estimate.title}.pdf`,
  [JOB_TYPES.RENDER_PARTS_ORDER_PDF]: (estimate) =>
    `${estimate.title} — parts order.pdf`,
};

@injectable()
export class DocumentJobServiceImpl implements DocumentJobService {
  constructor(
    @inject(ESTIMATE_REPOSITORY_TOKEN)
    private readonly estimates: EstimateRepository,
    @inject(JOB_REPOSITORY_TOKEN)
    private readonly jobs: JobRepository,
    @inject(TASK_QUEUE_TOKEN)
    private readonly queue: TaskQueue,
    @inject(OBJECT_STORAGE_TOKEN)
    private readonly storage: ObjectStorage,
  ) {}

  requestEstimatePdf(
    orgId: string,
    estimateId: string,
  ): Promise<DocumentJobView> {
    return this.request(orgId, estimateId, JOB_TYPES.RENDER_ESTIMATE_PDF);
  }

  requestPartsOrderPdf(
    orgId: string,
    estimateId: string,
  ): Promise<DocumentJobView> {
    return this.request(orgId, estimateId, JOB_TYPES.RENDER_PARTS_ORDER_PDF);
  }

  async status(orgId: string, jobId: string): Promise<DocumentJobView> {
    // Org-scoped by signature: there is no unscoped find-by-id to reach for, so
    // a cross-tenant poll can't be written by accident.
    const job = await this.jobs.findForOrg(orgId, jobId);
    if (!job) {
      throw new ServiceError("NOT_FOUND", "Document job not found");
    }
    return this.toView(job, jobId);
  }

  private async request(
    orgId: string,
    estimateId: string,
    jobType: string,
  ): Promise<DocumentJobView> {
    const estimate = await this.estimates.findById(orgId, estimateId);
    if (!estimate) {
      // Org-scoped read, so a cross-org id is NOT_FOUND rather than FORBIDDEN —
      // it must not be identifiable as "exists, elsewhere".
      throw new ServiceError("NOT_FOUND", "Estimate not found");
    }

    // Both document kinds share this key and differ only by jobType, which is
    // part of the collection's unique index — so they never collide.
    const dedupKey = estimateDedupKey(
      estimateId,
      estimate.updatedAt,
      PRICING_FORMULA_VERSION,
    );

    // $setOnInsert: an existing row comes back exactly as it was left, which is
    // what makes the short-circuit below safe.
    const job = await this.jobs.enqueuePending({
      jobType,
      dedupKey,
      orgId,
      payload: {
        orgId,
        estimateId,
        updatedAt: estimate.updatedAt,
        formulaVersion: PRICING_FORMULA_VERSION,
      },
    });

    if (job.status === "succeeded") {
      // The valuable property: a second click on an unedited estimate is one
      // Mongo read and a signed URL. No render, no queue hop.
      return this.toView(job, job.id, estimate);
    }

    await this.queue.enqueue({
      queue: QUEUES.DOCUMENT_RENDER,
      jobType,
      // attempts is in the name so a retry of a FAILED job is genuinely a new
      // task, while an accidental double-click is still refused by the queue.
      name: taskName(jobType, dedupKey, job.attempts),
      payload: { dedupKey },
    });

    return { jobId: job.id, status: job.status, url: null };
  }

  private async toView(
    job: Job,
    jobId: string,
    estimate?: Estimate,
  ): Promise<DocumentJobView> {
    if (job.status !== "succeeded") {
      return { jobId, status: job.status, url: null };
    }

    const parsed = renderResultSchema.safeParse(job.result);
    if (!parsed.success) {
      // Succeeded without a usable result — a bug, not a user-facing state.
      // Report it as failed rather than handing back a broken link.
      return { jobId, status: "failed", url: null };
    }

    const filename = estimate
      ? (FILENAME[job.jobType]?.(estimate) ?? "document.pdf")
      : "document.pdf";

    return {
      jobId,
      status: "succeeded",
      // Minted on read with a short TTL, never stored.
      url: await this.storage.signedDownloadUrl(
        parsed.data.storageKey,
        filename,
      ),
    };
  }
}
