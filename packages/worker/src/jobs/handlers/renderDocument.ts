import { inject, injectable } from "tsyringe";
import { z } from "zod";
import {
  DOCUMENT_ASSEMBLY_SERVICE_TOKEN,
  ESTIMATE_PDF_FILE,
  LOGGER_TOKEN,
  MissingEstimateError,
  OBJECT_STORAGE_TOKEN,
  PARTS_ORDER_PDF_FILE,
  documentObjectKey,
  type DocumentAssemblyService,
  type EstimateDocument,
  type Job,
  type Logger,
  type ObjectStorage,
  type PartsOrderDocument,
} from "@landscape/platform";
import {
  renderEstimatePdf,
  renderPartsOrderPdf,
} from "../../documents/render.tsx";
import type { JobHandler } from "../JobHandler.ts";
import { PoisonJobError } from "../PoisonJobError.ts";

/**
 * What a render job carries. The version components are in the payload rather
 * than re-read from the estimate on purpose: the job, its object key and its
 * dedup key must all describe the SAME version, even if the estimate is edited
 * while the job sits in the queue.
 */
export const renderJobPayloadSchema = z.object({
  orgId: z.string().min(1),
  estimateId: z.string().min(1),
  updatedAt: z.string().min(1),
  formulaVersion: z.number().int().positive(),
});

/** Persisted as the job's `result`. The download link reads `storageKey`. */
export interface RenderResult {
  storageKey: string;
  byteSize: number;
}

/**
 * Assemble → render → put. The whole render pipeline, in that order and nothing
 * else: all the logic is upstream in DocumentAssemblyService, all the layout is
 * downstream in the templates.
 *
 * Idempotent by construction — the object key is derived from the estimate's
 * version, so a redelivery overwrites the same bytes at the same key.
 *
 * Failure classification is the one judgement here. A missing estimate or an
 * unparseable payload can never succeed however many times it runs, so it is
 * poison (recorded, then acked). Anything else — a storage blip, a render
 * crash — is left to propagate as transient so the queue retries per policy.
 */
abstract class RenderDocumentHandler implements JobHandler {
  constructor(
    protected readonly assembly: DocumentAssemblyService,
    protected readonly storage: ObjectStorage,
    protected readonly logger: Logger,
  ) {}

  protected abstract readonly file: string;
  protected abstract build(
    orgId: string,
    estimateId: string,
  ): Promise<Uint8Array>;

  async handle(job: Job): Promise<RenderResult> {
    const parsed = renderJobPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      throw new PoisonJobError(
        `malformed render payload: ${parsed.error.message}`,
      );
    }
    const { orgId, estimateId, updatedAt, formulaVersion } = parsed.data;

    let bytes: Uint8Array;
    try {
      bytes = await this.build(orgId, estimateId);
    } catch (error) {
      if (error instanceof MissingEstimateError) {
        // Deleted, or not this org. Retrying cannot bring it back.
        throw new PoisonJobError(error.message);
      }
      throw error;
    }

    const storageKey = documentObjectKey(
      orgId,
      estimateId,
      updatedAt,
      formulaVersion,
      this.file,
    );
    // Same key, idempotent overwrite — so a retry after a partial failure is
    // safe and leaves no orphan.
    await this.storage.put(storageKey, bytes, "application/pdf");

    this.logger.info(
      { storageKey, byteSize: bytes.byteLength },
      "document rendered",
    );
    return { storageKey, byteSize: bytes.byteLength };
  }
}

@injectable()
export class RenderEstimatePdfHandler extends RenderDocumentHandler {
  protected readonly file = ESTIMATE_PDF_FILE;

  /**
   * The PDF engine, as an overridable property rather than a constructor
   * parameter. tsyringe resolves every declared constructor parameter — a
   * default value does not exempt it — and there is no TypeInfo for a function
   * type, so a defaulted fourth argument fails container resolution with
   * "TypeInfo not known for Object". Tests substitute it by subclassing.
   */
  protected render: (doc: EstimateDocument) => Promise<Uint8Array> =
    renderEstimatePdf;

  constructor(
    @inject(DOCUMENT_ASSEMBLY_SERVICE_TOKEN) assembly: DocumentAssemblyService,
    @inject(OBJECT_STORAGE_TOKEN) storage: ObjectStorage,
    @inject(LOGGER_TOKEN) logger: Logger,
  ) {
    super(assembly, storage, logger);
  }

  protected async build(
    orgId: string,
    estimateId: string,
  ): Promise<Uint8Array> {
    return this.render(
      await this.assembly.buildEstimateDocument(orgId, estimateId),
    );
  }
}

@injectable()
export class RenderPartsOrderPdfHandler extends RenderDocumentHandler {
  protected readonly file = PARTS_ORDER_PDF_FILE;

  /** See RenderEstimatePdfHandler.render for why this isn't injected. */
  protected render: (doc: PartsOrderDocument) => Promise<Uint8Array> =
    renderPartsOrderPdf;

  constructor(
    @inject(DOCUMENT_ASSEMBLY_SERVICE_TOKEN) assembly: DocumentAssemblyService,
    @inject(OBJECT_STORAGE_TOKEN) storage: ObjectStorage,
    @inject(LOGGER_TOKEN) logger: Logger,
  ) {
    super(assembly, storage, logger);
  }

  protected async build(
    orgId: string,
    estimateId: string,
  ): Promise<Uint8Array> {
    return this.render(
      await this.assembly.buildPartsOrderDocument(orgId, estimateId),
    );
  }
}
