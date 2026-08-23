import { describe, expect, it, mock } from "bun:test";
import { MissingEstimateError } from "@landscape/platform";
import {
  makeJob,
  makeObjectStorageFake,
} from "@landscape/platform/test-support";
import { PoisonJobError } from "../PoisonJobError.ts";
import {
  RenderEstimatePdfHandler,
  RenderPartsOrderPdfHandler,
} from "./renderDocument.ts";

const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => noopLogger,
} as never;

const PAYLOAD = {
  orgId: "org_1",
  estimateId: "est_1",
  updatedAt: "2026-08-01T12:00:00.000Z",
  formulaVersion: 1,
};
const EXPECTED_KEY = "orgs/org_1/estimates/est_1/1785585600000-f1/estimate.pdf";

const assembly = (over = {}) =>
  ({
    buildEstimateDocument: mock(async () => ({ title: "Estimate" })),
    buildPartsOrderDocument: mock(async () => ({ title: "Parts order" })),
    ...over,
  }) as never;

const renderer = mock(async () => new Uint8Array([37, 80, 68, 70, 1, 2, 3]));

/**
 * The handler under test, with the PDF engine swapped out — what it does with
 * the bytes is the subject here, not how they were drawn. Substituted by
 * subclassing because the renderer is a property, not an injected constructor
 * parameter; see the note on RenderEstimatePdfHandler.render.
 */
class StubbedHandler extends RenderEstimatePdfHandler {
  protected override render = renderer;
}

describe("RenderEstimatePdfHandler", () => {
  it("assembles, renders and stores the document at the versioned key", async () => {
    const storage = makeObjectStorageFake();
    const handler = new StubbedHandler(assembly(), storage, noopLogger);

    await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(storage.objects.get(EXPECTED_KEY)).toEqual({
      bytes: new Uint8Array([37, 80, 68, 70, 1, 2, 3]),
      contentType: "application/pdf",
    });
  });

  it("returns the storage key and size, which is what the download link reads", async () => {
    const handler = new StubbedHandler(
      assembly(),
      makeObjectStorageFake(),
      noopLogger,
    );

    const result = await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(result).toEqual({ storageKey: EXPECTED_KEY, byteSize: 7 });
  });

  it("loads the estimate org-scoped, from the payload's org", async () => {
    const build = mock(async () => ({ title: "Estimate" }));
    const handler = new StubbedHandler(
      assembly({ buildEstimateDocument: build }),
      makeObjectStorageFake(),
      noopLogger,
    );

    await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(build).toHaveBeenCalledWith("org_1", "est_1");
  });

  it("is poison when the estimate is gone — a retry cannot help", async () => {
    const handler = new StubbedHandler(
      assembly({
        buildEstimateDocument: mock(async () => {
          throw new MissingEstimateError("est_1");
        }),
      }),
      makeObjectStorageFake(),
      noopLogger,
    );

    await expect(handler.handle(makeJob({ payload: PAYLOAD }))).rejects.toThrow(
      PoisonJobError,
    );
  });

  it("is poison when the payload doesn't parse", async () => {
    const handler = new StubbedHandler(
      assembly(),
      makeObjectStorageFake(),
      noopLogger,
    );

    await expect(
      handler.handle(makeJob({ payload: { nonsense: true } })),
    ).rejects.toThrow(PoisonJobError);
  });

  it("lets a storage failure through as transient, so the queue retries", async () => {
    const storage = makeObjectStorageFake({
      put: mock(async () => {
        throw new Error("503 backend error");
      }),
    });
    const handler = new StubbedHandler(assembly(), storage, noopLogger);

    await expect(handler.handle(makeJob({ payload: PAYLOAD }))).rejects.toThrow(
      "503 backend error",
    );
    await expect(
      handler.handle(makeJob({ payload: PAYLOAD })),
    ).rejects.not.toThrow(PoisonJobError);
  });
});

class StubbedPartsHandler extends RenderPartsOrderPdfHandler {
  protected override render = renderer;
}

describe("RenderPartsOrderPdfHandler", () => {
  it("assembles the parts order — not the estimate — and stores it under its own file name", async () => {
    const buildParts = mock(async () => ({ title: "Parts order" }));
    const buildEstimate = mock(async () => ({ title: "Estimate" }));
    const storage = makeObjectStorageFake();
    const handler = new StubbedPartsHandler(
      assembly({
        buildPartsOrderDocument: buildParts,
        buildEstimateDocument: buildEstimate,
      }),
      storage,
      noopLogger,
    );

    const result = await handler.handle(makeJob({ payload: PAYLOAD }));

    expect(buildParts).toHaveBeenCalledWith("org_1", "est_1");
    expect(buildEstimate).not.toHaveBeenCalled();
    // Same version folder as the estimate PDF, different file — one render of
    // each kind can coexist for a given estimate version.
    expect(result).toEqual({
      storageKey: "orgs/org_1/estimates/est_1/1785585600000-f1/parts-order.pdf",
      byteSize: 7,
    });
    expect(storage.objects.has(EXPECTED_KEY)).toBe(false);
  });
});
