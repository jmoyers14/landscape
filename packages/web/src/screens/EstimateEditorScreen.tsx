import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@landscape/api";
import {
  previewEstimate,
  summarizeTasks,
  type CatalogContext,
  type EstimateSelection,
  type EstimateTotals,
  type EstimateView,
  type TaskGroup,
} from "@landscape/domain";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page } from "../components/ui.tsx";
import { formatCurrency, formatQuantity } from "../lib/format.ts";

type RouterOutput = inferRouterOutputs<AppRouter>;
type SavedEstimate = NonNullable<RouterOutput["estimates"]["get"]>;
type LineItemView = EstimateView["lineItems"][number];
type EstimateStatus = SavedEstimate["status"];
type CatalogAssembly = CatalogContext["assemblies"][number];
type Driver = CatalogAssembly["drivers"][number];

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

export function EstimateEditorScreen() {
  const { projectId, estimateId } = useParams({
    from: "/projects/$projectId/estimates/$estimateId",
  });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const estimate = useQuery(
    trpc.estimates.get.queryOptions({ id: estimateId }),
  );
  const context = useQuery(trpc.estimates.context.queryOptions());

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
    trpc.estimates.updateMeta.mutationOptions({
      onSuccess: onMutated,
      onError,
    }),
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
      <Page max="6xl">
        <p className="text-slate-400">Loading…</p>
      </Page>
    );
  }

  if (!estimate.data) {
    return (
      <Page max="6xl" className="space-y-4">
        <BackLink projectId={projectId} />
        <p className="text-slate-500">Estimate not found.</p>
      </Page>
    );
  }

  const data = estimate.data;
  const isDraft = data.status === "draft";

  return (
    <Page max="6xl" className="space-y-6">
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
        context.data ? (
          <DraftEditor
            // Re-seed the local draft whenever the saved selection changes
            // (e.g. after a successful regenerate).
            key={JSON.stringify(data.assemblies)}
            initial={buildSelections(data.assemblies, context.data.assemblies)}
            context={context.data}
            busy={setAssemblies.isPending}
            onSave={(assemblies) =>
              setAssemblies.mutate({ id: estimateId, assemblies })
            }
          />
        ) : (
          <p className="text-sm text-slate-400">Loading catalog…</p>
        )
      ) : (
        <SavedEstimateView estimate={data} />
      )}
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

// Two-column estimate shell: a sticky summary rail on the left (totals + any
// actions) and the per-assembly detail on the right. Stacks to one column on
// small screens.
function EstimateLayout({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-3 lg:sticky lg:top-8">{aside}</aside>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

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
  saved: SavedEstimate["assemblies"],
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
      values[driver.key] = String(
        entry.driverValues[driver.key] ?? driver.defaultValue,
      );
    }
    return {
      assemblyId: entry.assemblyId,
      name: match?.name ?? entry.name,
      drivers,
      values,
    };
  });
}

// Convert the editable form state into the engine's selection input (numbers).
function toSelections(selections: Selection[]): EstimateSelection[] {
  return selections.map((s) => {
    const driverValues: Record<string, number> = {};
    for (const driver of s.drivers) {
      driverValues[driver.key] = Number(s.values[driver.key]) || 0;
    }
    return { assemblyId: s.assemblyId, driverValues };
  });
}

// The draft editor: pick assemblies + edit driver values, watching each
// assembly's line items and the running totals recompute live (no round-trip)
// via the shared engine. "Save" persists; the server re-runs the
// same engine and freezes the snapshot, so the saved estimate matches this view.
function DraftEditor({
  initial,
  context,
  busy,
  onSave,
}: {
  initial: Selection[];
  context: CatalogContext;
  busy: boolean;
  onSave: (assemblies: EstimateSelection[]) => void;
}) {
  const [selections, setSelections] = useState<Selection[]>(initial);
  const catalog = context.assemblies;

  // Live preview: re-priced on every selection/driver change, in-memory.
  const view = useMemo(
    () => previewEstimate(toSelections(selections), context),
    [selections, context],
  );

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

  return (
    <EstimateLayout
      aside={
        <>
          <TotalsPanel estimate={view} />
          <button
            onClick={() => onSave(toSelections(selections))}
            disabled={busy}
            className="w-full rounded bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {selections.length === 0 ? (
        <p className="text-sm text-slate-400">
          No assemblies yet. Add one below and set its quantities — the estimate
          updates as you type.
        </p>
      ) : (
        selections.map((selection) => (
          <DraftAssemblyBlock
            key={selection.assemblyId}
            selection={selection}
            view={view}
            lines={lineItemsFor(view, selection.assemblyId)}
            onRemove={() => removeAssembly(selection.assemblyId)}
            onValue={(key, value) => setValue(selection.assemblyId, key, value)}
          />
        ))
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
    </EstimateLayout>
  );
}

// Read-only view of a saved (non-draft) estimate: same two-column shell, with
// each assembly's frozen driver values and line items grouped together. Also
// renders any assemblyTotals bucket the engine produced that isn't one of the
// estimate's own assemblies — the "Other" (no source assembly) and "Unknown
// assembly" (a since-renamed/removed catalog entry) buckets — so their money
// always appears somewhere on screen, not just in the totals panel.
function SavedEstimateView({ estimate }: { estimate: SavedEstimate }) {
  const view: EstimateView = estimate;
  const knownIds = new Set(estimate.assemblies.map((a) => a.assemblyId));
  const orphanTotals = view.assemblyTotals.filter(
    (t) => t.assemblyId === null || !knownIds.has(t.assemblyId),
  );
  return (
    <EstimateLayout aside={<TotalsPanel estimate={view} />}>
      {estimate.assemblies.length === 0 && orphanTotals.length === 0 ? (
        <p className="text-sm text-slate-400">
          This estimate has no assemblies.
        </p>
      ) : (
        <>
          {estimate.assemblies.map((assembly) => (
            <SavedAssemblyBlock
              key={assembly.assemblyId}
              assemblyId={assembly.assemblyId}
              view={view}
              name={assembly.name}
              driverValues={assembly.driverValues}
              lines={lineItemsFor(view, assembly.assemblyId)}
            />
          ))}
          {orphanTotals.map((t) => (
            <SavedAssemblyBlock
              key={t.assemblyId ?? "__none__"}
              assemblyId={t.assemblyId}
              view={view}
              name={t.name}
              driverValues={{}}
              lines={lineItemsFor(view, t.assemblyId)}
            />
          ))}
        </>
      )}
    </EstimateLayout>
  );
}

// The generated lines for one assembly, in engine order. assemblyId is
// nullable so the orphan "Other" bucket (lines with no source assembly) can
// share this lookup too.
function lineItemsFor(
  view: EstimateView,
  assemblyId: string | null,
): LineItemView[] {
  return view.lineItems.filter((line) => line.sourceAssemblyId === assemblyId);
}

// The engine's buildup for one assembly. An assembly with no lines yet has no
// entry, so fall back to zeros rather than letting the block disappear. Frozen
// since one shared instance is handed to every empty block.
const EMPTY_TOTALS: EstimateTotals = Object.freeze({
  materialCost: 0,
  laborCost: 0,
  tax: 0,
  directCost: 0,
  overhead: 0,
  profit: 0,
  total: 0,
  materialProfit: 0,
  laborProfit: 0,
  materialTotal: 0,
  laborTotal: 0,
});

function totalsFor(view: EstimateView, assemblyId: string | null) {
  const found = view.assemblyTotals.find((a) => a.assemblyId === assemblyId);
  if (!found) {
    return EMPTY_TOTALS;
  }
  return found;
}

// One assembly block in the draft editor: header + total, editable driver
// inputs, its live line items, then its own overhead/profit buildup.
function DraftAssemblyBlock({
  selection,
  view,
  lines,
  onRemove,
  onValue,
}: {
  selection: Selection;
  view: EstimateView;
  lines: LineItemView[];
  onRemove: () => void;
  onValue: (key: string, value: string) => void;
}) {
  const totals = totalsFor(view, selection.assemblyId);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <BlockHeader name={selection.name} total={totals.total}>
        <button
          onClick={onRemove}
          className="text-sm text-slate-400 hover:text-red-600"
        >
          Remove
        </button>
      </BlockHeader>

      {selection.drivers.length > 0 && (
        <div className="flex flex-wrap gap-4 border-b border-slate-100 px-4 py-3">
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
                onChange={(e) => onValue(driver.key, e.target.value)}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
              />
              {driver.unit && (
                <span className="text-slate-400">{driver.unit}</span>
              )}
            </label>
          ))}
        </div>
      )}

      <AssemblyLines
        lines={lines}
        totals={totals}
        overheadRate={view.overheadRate}
        profitRate={view.profitRate}
      />
    </div>
  );
}

// One assembly block in the read-only saved view: header + total, the frozen
// driver values, its line items, then its own overhead/profit buildup.
function SavedAssemblyBlock({
  assemblyId,
  view,
  name,
  driverValues,
  lines,
}: {
  assemblyId: string | null;
  view: EstimateView;
  name: string;
  driverValues: Record<string, number>;
  lines: LineItemView[];
}) {
  const drivers = Object.entries(driverValues);
  const totals = totalsFor(view, assemblyId);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <BlockHeader name={name} total={totals.total} />
      {drivers.length > 0 && (
        <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
          {drivers.map(([key, value]) => `${key}: ${value}`).join(", ")}
        </div>
      )}
      <AssemblyLines
        lines={lines}
        totals={totals}
        overheadRate={view.overheadRate}
        profitRate={view.profitRate}
      />
    </div>
  );
}

function BlockHeader({
  name,
  total,
  children,
}: {
  name: string;
  total: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
      <span className="font-medium text-slate-800">{name}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">
          {formatCurrency(total)}
        </span>
        {children}
      </div>
    </div>
  );
}

// The workbook's two money columns — M (materials) and P (labor) — run down the
// whole buildup and combine only at the bottom. The four rows are defined once
// here so the assembly footer and the estimate panel, which render them into
// different table shapes, can never disagree about a figure or a label.
interface BuildupRow {
  label: string;
  material: ReactNode;
  labor: ReactNode;
  strong?: boolean;
}

function buildupRows(
  totals: EstimateTotals,
  overheadRate: number,
  profitRate: number,
): BuildupRow[] {
  return [
    {
      label: "Subtotal",
      material: formatCurrency(totals.materialCost),
      labor: formatCurrency(totals.laborCost),
    },
    // An em dash, not $0.00 — labor never carries overhead, so there is no
    // figure. A zero would claim the rate applied and came to nothing.
    {
      label: `Overhead (${overheadRate}%)`,
      material: formatCurrency(totals.overhead),
      labor: "—",
    },
    {
      label: `Profit (${profitRate}%)`,
      material: formatCurrency(totals.materialProfit),
      labor: formatCurrency(totals.laborProfit),
    },
    {
      label: "Total",
      material: formatCurrency(totals.materialTotal),
      labor: formatCurrency(totals.laborTotal),
      strong: true,
    },
  ];
}

// The estimate panel's buildup. It stands alone in the sidebar with no line
// items beneath it, so it carries its own Material/Labor headings.
function BuildupTable({
  totals,
  overheadRate,
  profitRate,
}: {
  totals: EstimateTotals;
  overheadRate: number;
  profitRate: number;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="text-xs text-slate-400">
          <th />
          <th className="pb-1 text-right font-medium">Material</th>
          <th className="pb-1 text-right font-medium">Labor</th>
        </tr>
      </thead>
      <tbody>
        {buildupRows(totals, overheadRate, profitRate).map((r) => (
          <tr
            key={r.label}
            className={
              r.strong ? "font-semibold text-slate-800" : "text-slate-600"
            }
          >
            <td className={r.strong ? "pt-1" : undefined}>{r.label}</td>
            <td className={`text-right tabular-nums ${r.strong ? "pt-1" : ""}`}>
              {r.material}
            </td>
            <td className={`text-right tabular-nums ${r.strong ? "pt-1" : ""}`}>
              {r.labor}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// The sheet ends each phase with its own buildup in the same two columns its
// line items use (rows 56–59). Rendering it as the line table's own <tfoot> is
// what makes Material and Labor line up from the first line item down to the
// phase total, exactly as M and P do in the workbook — two separate tables
// size their columns independently and cannot be made to agree.
function AssemblyBuildupFoot({
  totals,
  overheadRate,
  profitRate,
}: {
  totals: EstimateTotals;
  overheadRate: number;
  profitRate: number;
}) {
  const rows = buildupRows(totals, overheadRate, profitRate);
  return (
    <tfoot className="border-t border-slate-200 bg-slate-50/60">
      {rows.map((r, i) => {
        const pad = `${i === 0 ? "pt-3 " : ""}${
          i === rows.length - 1 ? "pb-3 " : ""
        }py-0.5`;
        const money = `px-4 ${pad} text-right tabular-nums whitespace-nowrap`;
        return (
          <tr
            key={r.label}
            className={
              r.strong ? "font-semibold text-slate-800" : "text-slate-600"
            }
          >
            <td colSpan={3} className={`px-4 ${pad}`}>
              {r.label}
            </td>
            <td className={money}>{r.material}</td>
            <td className={money}>{r.labor}</td>
            {/* The Total column reads the same the whole way down: the combined
                total of the rows above it. Task rows carry their task's; this
                carries the assembly's. */}
            <td className={money}>
              {r.strong ? formatCurrency(totals.total) : ""}
            </td>
          </tr>
        );
      })}
    </tfoot>
  );
}

// One assembly's line items and its closing buildup, in a single table. The
// buildup has to share this table — not sit in one of its own below it — or its
// Material and Labor figures will not fall under the Material and Labor columns
// of the lines they summarize.
function AssemblyLines({
  lines,
  totals,
  overheadRate,
  profitRate,
}: {
  lines: LineItemView[];
  totals: EstimateTotals;
  overheadRate: number;
  profitRate: number;
}) {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-400">No line items yet.</p>
    );
  }
  const blocks = summarizeTasks(lines);
  // Flatten a single-task assembly (e.g. Soil Prep): the assembly header already
  // names it and shows its total, so repeating a task header would be noise.
  const flat =
    blocks.length === 1 && blocks[0].kind === "group" ? blocks[0] : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="px-4 py-1.5 font-medium">Description</th>
            <th className="px-4 py-1.5 text-right font-medium whitespace-nowrap">
              Qty
            </th>
            <th className="px-4 py-1.5 text-right font-medium whitespace-nowrap">
              Unit price
            </th>
            <th className="px-4 py-1.5 text-right font-medium whitespace-nowrap">
              Material
            </th>
            <th className="px-4 py-1.5 text-right font-medium whitespace-nowrap">
              Labor
            </th>
            <th className="px-4 py-1.5 text-right font-medium whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {flat
            ? flat.lines.map((line) => <LineRow key={line.id} line={line} />)
            : blocks.map((block) =>
                block.kind === "group" ? (
                  <GroupRows key={block.key} group={block} />
                ) : (
                  <LineRow key={block.line.id} line={block.line} />
                ),
              )}
        </tbody>
        <AssemblyBuildupFoot
          totals={totals}
          overheadRate={overheadRate}
          profitRate={profitRate}
        />
      </table>
    </div>
  );
}

// A task: a header row naming it, its lines indented beneath, and a "Task total"
// row carrying all three money columns — the workbook's Q34 pattern. A
// single-line task collapses to just that line; a header and a total around one
// row is only noise, and its one number is already on screen.
function GroupRows({ group }: { group: TaskGroup }) {
  if (group.lines.length === 1) {
    return <LineRow line={group.lines[0]} />;
  }
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/60">
        <td colSpan={6} className="px-4 py-2 font-medium text-slate-800">
          {group.name}
        </td>
      </tr>
      {group.lines.map((line) => (
        <LineRow key={line.id} line={line} indented />
      ))}
      <tr className="border-b border-slate-200">
        <td
          colSpan={3}
          className="whitespace-nowrap px-4 pb-2 pt-1 text-right text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Task total
        </td>
        <td className="whitespace-nowrap px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.materialCost)}
        </td>
        <td className="whitespace-nowrap px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.laborCost)}
        </td>
        <td className="whitespace-nowrap px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.total)}
        </td>
      </tr>
    </>
  );
}

// One line item row, uniform for labor (qty in hours) and material (qty + unit).
// A line is one or the other, never both, so it fills exactly one money column
// and leaves the rest blank — a "$0.00" there would read as "this cost nothing"
// rather than "not applicable".
function LineRow({
  line,
  indented = false,
}: {
  line: LineItemView;
  indented?: boolean;
}) {
  const isLabor = line.type === "labor";
  return (
    <tr className="border-b border-slate-100">
      <td className={`py-2 text-slate-700 ${indented ? "pl-8 pr-4" : "px-4"}`}>
        {line.description}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right text-slate-600">
        {formatQuantity(line.quantity)}
        {isLabor ? " hr" : line.unit ? ` ${line.unit}` : ""}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right text-slate-600">
        {formatCurrency(line.unitPrice)}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700">
        {isLabor ? "" : formatCurrency(line.cost)}
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-slate-700">
        {isLabor ? formatCurrency(line.cost) : ""}
      </td>
      {/* The Total column holds combined totals only — a task's, or the
          assembly's in the footer. A line contributes to one column, so it has
          nothing to put here. */}
      <td className="whitespace-nowrap" />
    </tr>
  );
}

function MetaHeader({
  estimate,
  busy,
  onTitle,
  onStatus,
  onDelete,
}: {
  estimate: SavedEstimate;
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
  return (
    <div className="w-full space-y-2 rounded-lg border border-slate-200 p-4 text-sm shadow-sm">
      <h2 className="text-sm font-medium text-slate-600">Estimate</h2>
      <BuildupTable
        totals={totals}
        overheadRate={estimate.overheadRate}
        profitRate={estimate.profitRate}
      />
      <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-800">
        <span>Price</span>
        <span className="tabular-nums">{formatCurrency(totals.total)}</span>
      </div>
      {/* Tax is already inside materialCost, so it is a note, not a row — a
          fifth additive-looking row would break the column arithmetic above. */}
      <p className="text-xs text-slate-400">
        includes {formatCurrency(totals.tax)} sales tax on materials at{" "}
        {estimate.taxRate}%
      </p>
    </div>
  );
}
