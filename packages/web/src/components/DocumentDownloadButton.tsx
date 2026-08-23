import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc } from "../trpc.ts";

type DocumentKind = "estimate" | "partsOrder";

const POLL_INTERVAL_MS = 1500;
// Renders take a second or two; a minute means something is wrong. Give up with
// a retry affordance rather than polling a stuck job forever.
const GIVE_UP_AFTER_MS = 60_000;

const GENERIC_FAILURE =
  "We couldn't generate that document. Please try again in a moment.";

/**
 * Requests a generated document, polls until it's ready, then downloads it.
 *
 * The API returns a URL immediately when the document already exists for this
 * exact estimate version, so the common case never polls at all.
 *
 * A failed job's stored error is never rendered — it can carry internals — so
 * every failure shows the same generic message.
 */
export function DocumentDownloadButton({
  estimateId,
  kind,
  label,
}: {
  estimateId: string;
  kind: DocumentKind;
  label: string;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = (url: string) => {
    setJobId(null);
    // The signed URL carries content-disposition: attachment, so this downloads
    // rather than navigating away.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const requestEstimate = trpc.documents.requestEstimatePdf.mutationOptions({
    onSuccess: (result) => {
      onRequested(result);
    },
    onError: () => setError(GENERIC_FAILURE),
  });
  const requestPartsOrder = trpc.documents.requestPartsOrderPdf.mutationOptions(
    {
      onSuccess: (result) => {
        onRequested(result);
      },
      onError: () => setError(GENERIC_FAILURE),
    },
  );

  function onRequested(result: { jobId: string; url: string | null }) {
    if (result.url) {
      finish(result.url);
      return;
    }
    setJobId(result.jobId);
  }

  const request = useMutation(
    kind === "estimate" ? requestEstimate : requestPartsOrder,
  );

  const status = useQuery({
    ...trpc.documents.status.queryOptions({ jobId: jobId ?? "" }),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      return current === "pending" || current === "running"
        ? POLL_INTERVAL_MS
        : false;
    },
  });

  useEffect(() => {
    const data = status.data;
    if (!jobId || !data) {
      return;
    }
    if (data.url) {
      finish(data.url);
      return;
    }
    if (data.status === "failed") {
      setJobId(null);
      setError(GENERIC_FAILURE);
    }
  }, [jobId, status.data]);

  useEffect(() => {
    if (jobId === null) {
      return;
    }
    const timer = setTimeout(() => {
      setJobId(null);
      setError("This is taking longer than expected. Please try again.");
    }, GIVE_UP_AFTER_MS);
    return () => clearTimeout(timer);
  }, [jobId]);

  const working = request.isPending || jobId !== null;

  const start = () => {
    setError(null);
    request.mutate({ estimateId });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={working}
        onClick={start}
        className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {working ? "Preparing…" : label}
      </button>
      {error ? (
        <span className="text-xs text-red-700">
          {error}{" "}
          <button type="button" className="underline" onClick={start}>
            Retry
          </button>
        </span>
      ) : null}
    </div>
  );
}
