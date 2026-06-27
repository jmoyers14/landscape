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
type CatalogAssembly = RouterOutput["assemblies"]["list"][number];
type Driver = CatalogAssembly["drivers"][number];

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

export function EstimateEditorScreen() {
  const { projectId, estimateId } = useParams({
    from: "/projects/$projectId/estimates/$estimateId",
  });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const estimate = useQuery(trpc.estimates.get.queryOptions({ id: estimateId }));
  const catalog = useQuery(trpc.assemblies.list.queryOptions());

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.estimates.get.queryKey({ id: estimateId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.estimates.listByProject.queryKey({ projectId }),
    });
  };
  const onError = (e: { message: string }) => setError(e.message);
  const onMutated = () => {
    invalidate();
    setError(null);
  };

  const updateMeta = useMutation(
    trpc.estimates.updateMeta.mutationOptions({ onSuccess: onMutated, onError }),
  );
  const setAssemblies = useMutation(
    trpc.estimates.setAssemblies.mutationOptions({
      onSuccess: onMutated,
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
  const isDraft = data.status === "draft";

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

      {isDraft ? (
        catalog.data ? (
          <AssemblyEditor
            // Re-seed the local draft whenever the saved selection changes
            // (e.g. after a successful regenerate).
            key={JSON.stringify(data.assemblies)}
            initial={buildSelections(data.assemblies, catalog.data)}
            catalog={catalog.data}
            busy={setAssemblies.isPending}
            onSave={(assemblies) =>
              setAssemblies.mutate({ id: estimateId, assemblies })
            }
          />
        ) : (
          <p className="text-sm text-slate-400">Loading assemblies…</p>
        )
      ) : (
        <AssembliesSummary estimate={data} />
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-slate-600">Line items</h2>

        {data.lineItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No line items yet.{" "}
            {isDraft
              ? "Add assemblies above and save to generate them."
              : "This estimate has no assemblies."}
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

// A locally-editable selected assembly: which assembly, its driver definitions
// (from the catalog, for labels/units), and the working driver values as form
// strings.
interface Selection {
  assemblyId: string;
  name: string;
  drivers: Driver[];
  values: Record<string, string>;
}

// Joins the estimate's saved selection with the catalog so each row knows its
// driver definitions. A saved assembly that's since left the catalog still shows
// (by name, with its stored driver keys) so it can be removed.
function buildSelections(
  saved: EstimateView["assemblies"],
  catalog: CatalogAssembly[],
): Selection[] {
  return saved.map((entry) => {
    const match = catalog.find((a) => a.id === entry.assemblyId);
    const drivers =
      match?.drivers ??
      Object.keys(entry.driverValues).map((key) => ({
        key,
        label: key,
        unit: "",
        defaultValue: 0,
      }));
    const values: Record<string, string> = {};
    for (const driver of drivers) {
      values[driver.key] = String(entry.driverValues[driver.key] ?? driver.defaultValue);
    }
    return { assemblyId: entry.assemblyId, name: match?.name ?? entry.name, drivers, values };
  });
}

function AssemblyEditor({
  initial,
  catalog,
  busy,
  onSave,
}: {
  initial: Selection[];
  catalog: CatalogAssembly[];
  busy: boolean;
  onSave: (
    assemblies: { assemblyId: string; driverValues: Record<string, number> }[],
  ) => void;
}) {
  const [selections, setSelections] = useState<Selection[]>(initial);

  const selectedIds = new Set(selections.map((s) => s.assemblyId));
  const addable = catalog.filter((a) => !selectedIds.has(a.id));

  const addAssembly = (assemblyId: string) => {
    const assembly = catalog.find((a) => a.id === assemblyId);
    if (!assembly) {
      return;
    }
    const values: Record<string, string> = {};
    for (const driver of assembly.drivers) {
      values[driver.key] = String(driver.defaultValue);
    }
    setSelections([
      ...selections,
      { assemblyId, name: assembly.name, drivers: assembly.drivers, values },
    ]);
  };

  const removeAssembly = (assemblyId: string) => {
    setSelections(selections.filter((s) => s.assemblyId !== assemblyId));
  };

  const setValue = (assemblyId: string, key: string, value: string) => {
    setSelections(
      selections.map((s) =>
        s.assemblyId === assemblyId
          ? { ...s, values: { ...s.values, [key]: value } }
          : s,
      ),
    );
  };

  const save = () => {
    onSave(
      selections.map((s) => {
        const driverValues: Record<string, number> = {};
        for (const driver of s.drivers) {
          driverValues[driver.key] = Number(s.values[driver.key]) || 0;
        }
        return { assemblyId: s.assemblyId, driverValues };
      }),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-600">Assemblies</h2>
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-gold px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-light disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save & regenerate"}
        </button>
      </div>

      {selections.length === 0 ? (
        <p className="text-sm text-slate-400">
          No assemblies selected. Add one below, set its quantities, then save.
        </p>
      ) : (
        <div className="space-y-3">
          {selections.map((selection) => (
            <div
              key={selection.assemblyId}
              className="rounded-lg border border-slate-200 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">
                  {selection.name}
                </span>
                <button
                  onClick={() => removeAssembly(selection.assemblyId)}
                  className="text-sm text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
              {selection.drivers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-4">
                  {selection.drivers.map((driver) => (
                    <label
                      key={driver.key}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      {driver.label}
                      <input
                        type="number"
                        min={0}
                        value={selection.values[driver.key] ?? ""}
                        onChange={(e) =>
                          setValue(selection.assemblyId, driver.key, e.target.value)
                        }
                        className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                      {driver.unit && (
                        <span className="text-slate-400">{driver.unit}</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {addable.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              addAssembly(e.target.value);
            }
          }}
          className="rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
        >
          <option value="">+ Add assembly…</option>
          {addable.map((assembly) => (
            <option key={assembly.id} value={assembly.id}>
              {assembly.name}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}

// Read-only summary of the assemblies a non-draft estimate was generated from.
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
