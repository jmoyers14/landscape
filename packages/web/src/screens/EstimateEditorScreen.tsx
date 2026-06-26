import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@landscape/api";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page } from "../components/ui.tsx";
import { formatCurrency } from "../lib/format.ts";

type RouterOutput = inferRouterOutputs<AppRouter>;
type EstimateView = NonNullable<RouterOutput["estimates"]["get"]>;
type LineItemView = EstimateView["lineItems"][number];
type LineItemType = LineItemView["type"];
type EstimateStatus = EstimateView["status"];

const TYPE_LABEL: Record<LineItemType, string> = {
  material: "Material",
  labor: "Labor",
  equipment: "Equipment",
  other: "Other",
};

const ESTIMATE_STATUSES = [
  "draft",
  "sent",
  "accepted",
] as const satisfies readonly EstimateStatus[];

const STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
};

const phaseLabel = (phase: string | null) => phase || "General";

// NOTE: Line items are now a generated snapshot — they come from the assemblies
// chosen for the estimate (estimates.setAssemblies), not hand entry. This screen
// is read-only for now; the assembly picker + driver inputs land in Phase E.
export function EstimateEditorScreen() {
  const { projectId, estimateId } = useParams({
    from: "/projects/$projectId/estimates/$estimateId",
  });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const estimate = useQuery(
    trpc.estimates.get.queryOptions({ id: estimateId }),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.estimates.get.queryKey({ id: estimateId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.estimates.listByProject.queryKey({ projectId }),
    });
  };
  const onError = (e: { message: string }) => setError(e.message);

  const updateMeta = useMutation(
    trpc.estimates.updateMeta.mutationOptions({
      onSuccess: () => {
        invalidate();
        setError(null);
      },
      onError,
    }),
  );
  const removeEstimate = useMutation(
    trpc.estimates.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.estimates.listByProject.queryKey({ projectId }),
        });
        navigate({ to: "/projects/$projectId", params: { projectId } });
      },
      onError,
    }),
  );

  if (estimate.isLoading) {
    return (
      <Page max="3xl">
        <p className="text-slate-400">Loading…</p>
      </Page>
    );
  }

  if (!estimate.data) {
    return (
      <Page max="3xl" className="space-y-4">
        <BackLink projectId={projectId} />
        <p className="text-slate-500">Estimate not found.</p>
      </Page>
    );
  }

  const data = estimate.data;

  // Group line items by phase, preserving the phase order from the calc engine.
  const itemsByPhase = new Map<string | null, LineItemView[]>();
  for (const item of data.lineItems) {
    const group = itemsByPhase.get(item.phase) ?? [];
    group.push(item);
    itemsByPhase.set(item.phase, group);
  }

  return (
    <Page max="3xl" className="space-y-6">
      <BackLink projectId={projectId} />
      <ErrorNote message={error} />

      <MetaHeader
        key={data.id}
        estimate={data}
        busy={updateMeta.isPending || removeEstimate.isPending}
        onTitle={(title) => updateMeta.mutate({ id: estimateId, title })}
        onStatus={(status) => updateMeta.mutate({ id: estimateId, status })}
        onDelete={() => removeEstimate.mutate({ id: estimateId })}
      />

      <AssembliesSummary estimate={data} />

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-slate-600">Line items</h2>

        {data.lineItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No line items yet. Line items are generated from the assemblies
            chosen for this estimate — the assembly picker is coming soon.
          </p>
        ) : (
          data.phases.map((phase) => (
            <div
              key={phaseLabel(phase.phase)}
              className="overflow-hidden rounded-lg border border-slate-200 shadow-sm"
            >
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                <span className="text-sm font-medium text-slate-700">
                  {phaseLabel(phase.phase)}
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {formatCurrency(phase.subtotal)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                      <th className="px-4 py-1.5 font-medium">Description</th>
                      <th className="px-4 py-1.5 font-medium">Type</th>
                      <th className="px-4 py-1.5 text-right font-medium">Qty</th>
                      <th className="px-4 py-1.5 text-right font-medium">
                        Unit price
                      </th>
                      <th className="px-4 py-1.5 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(itemsByPhase.get(phase.phase) ?? []).map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-4 py-2 text-slate-800">
                          {item.description}
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {TYPE_LABEL[item.type]}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {item.quantity}
                          {item.unit ? ` ${item.unit}` : ""}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-slate-800">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>

      <TotalsPanel estimate={data} />
    </Page>
  );
}

const BackLink = ({ projectId }: { projectId: string }) => (
  <Link
    to="/projects/$projectId"
    params={{ projectId }}
    className="text-sm text-slate-500 hover:text-slate-700"
  >
    ← Project
  </Link>
);

function MetaHeader({
  estimate,
  busy,
  onTitle,
  onStatus,
  onDelete,
}: {
  estimate: EstimateView;
  busy: boolean;
  onTitle: (title: string) => void;
  onStatus: (status: EstimateStatus) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(estimate.title);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <input
        className="w-full max-w-sm rounded border border-transparent px-1 text-2xl font-bold text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:outline-none"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const trimmed = title.trim();
          if (trimmed && trimmed !== estimate.title) {
            onTitle(trimmed);
          } else {
            setTitle(estimate.title);
          }
        }}
      />
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={estimate.status}
          onChange={(e) => onStatus(e.target.value as EstimateStatus)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
        >
          {ESTIMATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded border border-slate-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Read-only summary of the assemblies this estimate was generated from.
function AssembliesSummary({ estimate }: { estimate: EstimateView }) {
  if (estimate.assemblies.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-slate-600">Assemblies</h2>
      <ul className="space-y-1 rounded-lg border border-slate-200 p-4 text-sm shadow-sm">
        {estimate.assemblies.map((assembly) => (
          <li
            key={assembly.assemblyId}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span className="font-medium text-slate-700">{assembly.name}</span>
            <span className="text-slate-500">
              {Object.entries(assembly.driverValues)
                .map(([key, value]) => `${key}: ${value}`)
                .join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TotalsPanel({ estimate }: { estimate: EstimateView }) {
  const { totals } = estimate;
  const row = (label: string, value: number, strong = false) => (
    <div
      className={`flex justify-between ${
        strong
          ? "border-t border-slate-200 pt-2 font-semibold text-slate-800"
          : "text-slate-600"
      }`}
    >
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="ml-auto w-full max-w-xs space-y-1 rounded-lg border border-slate-200 p-4 text-sm shadow-sm">
      {row("Direct cost", totals.directCost)}
      {row(`Overhead (${estimate.overheadRate}%)`, totals.overhead)}
      {row(`Profit (${estimate.profitRate}%)`, totals.profit)}
      {row(`Tax (${estimate.taxRate}%)`, totals.tax)}
      {row("Total", totals.total, true)}
    </div>
  );
}
