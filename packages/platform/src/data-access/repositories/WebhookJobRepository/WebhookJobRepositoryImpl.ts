import { injectable } from "tsyringe";
import { WebhookJobModel } from "../../models/WebhookJob.ts";
import type {
  WebhookJob,
  WebhookJobInput,
  WebhookJobRepository,
  WebhookJobStatus,
  WebhookSource,
} from "./WebhookJobRepository.ts";

type WebhookJobDoc = {
  _id: unknown;
  source: string;
  sourceEventId: string;
  jobType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  orgId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mongoose-backed WebhookJobRepository. Documents are mapped to the plain
 * WebhookJob entity so Mongoose types never escape.
 */
@injectable()
export class WebhookJobRepositoryImpl implements WebhookJobRepository {
  async enqueuePending(input: WebhookJobInput): Promise<WebhookJob> {
    // $setOnInsert only. A redelivered event must find its existing job exactly
    // as it left it — resetting a succeeded job to pending would cause the work
    // to run a second time, which is the failure mode this whole table prevents.
    const doc = await WebhookJobModel.findOneAndUpdate(
      {
        source: input.source,
        sourceEventId: input.sourceEventId,
        jobType: input.jobType,
      },
      {
        $setOnInsert: {
          orgId: input.orgId,
          status: "pending",
          attempts: 0,
          lastError: null,
        },
      },
      { upsert: true, returnDocument: "after" },
    ).lean<WebhookJobDoc>();

    return toWebhookJob(doc);
  }

  async markRunning(id: string): Promise<WebhookJob | null> {
    const doc = await WebhookJobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "running" }, $inc: { attempts: 1 } },
      { returnDocument: "after" },
    ).lean<WebhookJobDoc | null>();
    return doc ? toWebhookJob(doc) : null;
  }

  async markSucceeded(id: string): Promise<WebhookJob | null> {
    const doc = await WebhookJobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "succeeded", lastError: null } },
      { returnDocument: "after" },
    ).lean<WebhookJobDoc | null>();
    return doc ? toWebhookJob(doc) : null;
  }

  async markFailed(id: string, error: string): Promise<WebhookJob | null> {
    const doc = await WebhookJobModel.findOneAndUpdate(
      { _id: id },
      { $set: { status: "failed", lastError: error } },
      { returnDocument: "after" },
    ).lean<WebhookJobDoc | null>();
    return doc ? toWebhookJob(doc) : null;
  }

  async findById(id: string): Promise<WebhookJob | null> {
    const doc = await WebhookJobModel.findById(id).lean<WebhookJobDoc | null>();
    return doc ? toWebhookJob(doc) : null;
  }

  async findByJobKey(
    source: WebhookSource,
    sourceEventId: string,
    jobType: string,
  ): Promise<WebhookJob | null> {
    const doc = await WebhookJobModel.findOne({
      source,
      sourceEventId,
      jobType,
    }).lean<WebhookJobDoc | null>();
    return doc ? toWebhookJob(doc) : null;
  }

  async findByStatus(
    status: WebhookJobStatus,
    limit: number,
  ): Promise<WebhookJob[]> {
    const docs = await WebhookJobModel.find({ status })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean<WebhookJobDoc[]>();
    return docs.map(toWebhookJob);
  }
}

function toWebhookJob(doc: WebhookJobDoc): WebhookJob {
  return {
    id: String(doc._id),
    source: doc.source as WebhookSource,
    sourceEventId: doc.sourceEventId,
    jobType: doc.jobType,
    status: doc.status as WebhookJobStatus,
    attempts: doc.attempts,
    lastError: doc.lastError ?? null,
    orgId: doc.orgId ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
