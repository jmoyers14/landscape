import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@landscape/api";
import {
  previewEstimate,
  type CatalogContext,
  type EstimateSelection,
  type EstimateView,
} from "@landscape/core";
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

  const estimate = useQuery(trpc.estimates.get.queryOptions({ id: estimateId }));
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
// via the shared engine. "Save & regenerate" persists; the server re-runs the
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
            {busy ? "Saving…" : "Save & regenerate"}
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
            lines={lineItemsFor(view, selection.assemblyId)}
            onRemove={() => removeAssembly(selection.assemblyId)}
            onValue={(key, value) =>
              setValue(selection.assemblyId, key, value)
            }
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
// each assembly's frozen driver values and line items grouped together.
function SavedEstimateView({ estimate }: { estimate: SavedEstimate }) {
  const view: EstimateView = estimate;
  return (
    <EstimateLayout aside={<TotalsPanel estimate={view} />}>
      {estimate.assemblies.length === 0 ? (
        <p className="text-sm text-slate-400">
          This estimate has no assemblies.
        </p>
      ) : (
        estimate.assemblies.map((assembly) => (
          <SavedAssemblyBlock
            key={assembly.assemblyId}
            name={assembly.name}
            driverValues={assembly.driverValues}
            lines={lineItemsFor(view, assembly.assemblyId)}
          />
        ))
      )}
    </EstimateLayout>
  );
}

// The generated lines for one assembly, in engine order.
function lineItemsFor(view: EstimateView, assemblyId: string): LineItemView[] {
  return view.lineItems.filter((line) => line.sourceAssemblyId === assemblyId);
}

const blockSubtotal = (lines: LineItemView[]): number =>
  lines.reduce((sum, line) => sum + line.cost, 0);

// One assembly block in the draft editor: header + subtotal, editable driver
// inputs, then its live line items.
function DraftAssemblyBlock({
  selection,
  lines,
  onRemove,
  onValue,
}: {
  selection: Selection;
  lines: LineItemView[];
  onRemove: () => void;
  onValue: (key: string, value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <BlockHeader name={selection.name} subtotal={blockSubtotal(lines)}>
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

      <AssemblyLines lines={lines} />
    </div>
  );
}

// One assembly block in the read-only saved view: header + subtotal, the frozen
// driver values, then its line items.
function SavedAssemblyBlock({
  name,
  driverValues,
  lines,
}: {
  name: string;
  driverValues: Record<string, number>;
  lines: LineItemView[];
}) {
  const drivers = Object.entries(driverValues);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
      <BlockHeader name={name} subtotal={blockSubtotal(lines)} />
      {drivers.length > 0 && (
        <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
          {drivers.map(([key, value]) => `${key}: ${value}`).join(", ")}
        </div>
      )}
      <AssemblyLines lines={lines} />
    </div>
  );
}

function BlockHeader({
  name,
  subtotal,
  children,
}: {
  name: string;
  subtotal: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
      <span className="font-medium text-slate-800">{name}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">
          {formatCurrency(subtotal)}
        </span>
        {children}
      </div>
    </div>
  );
}

// A task group for display: a named grouping that owns a mix of labor and
// material lines. Loose lines are ungrouped lines shown on their own.
interface TaskGroup {
  kind: "group";
  key: string;
  name: string;
  lines: LineItemView[];
  total: number; // direct cost of the whole task
}
interface LooseLine {
  kind: "loose";
  line: LineItemView;
}
type LineBlock = TaskGroup | LooseLine;

// Buckets the flat (engine-ordered) lines into task groups by taskKey, keeping
// each group at the position of its first line. Ungrouped lines stay loose.
function toBlocks(lines: LineItemView[]): LineBlock[] {
  const blocks: LineBlock[] = [];
  const byKey = new Map<string, TaskGroup>();
  for (const line of lines) {
    if (line.taskKey == null) {
      blocks.push({ kind: "loose", line });
      continue;
    }
    let group = byKey.get(line.taskKey);
    if (!group) {
      group = {
        kind: "group",
        key: line.taskKey,
        name: line.taskName ?? line.taskKey,
        lines: [],
        total: 0,
      };
      byKey.set(line.taskKey, group);
      blocks.push(group);
    }
    group.lines.push(line);
    group.total += line.cost;
  }
  return blocks;
}

function AssemblyLines({ lines }: { lines: LineItemView[] }) {
  if (lines.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-slate-400">No line items yet.</p>
    );
  }
  const blocks = toBlocks(lines);
  // Flatten a single-task assembly (e.g. Soil Prep): the assembly header already
  // names it and shows its subtotal, so repeating a task header would be noise.
  const flat =
    blocks.length === 1 && blocks[0].kind === "group" ? blocks[0] : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
            <th className="px-4 py-1.5 font-medium">Description</th>
            <th className="px-4 py-1.5 text-right font-medium">Qty</th>
            <th className="px-4 py-1.5 text-right font-medium">Unit price</th>
            <th className="px-4 py-1.5 text-right font-medium">Total</th>
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
      </table>
    </div>
  );
}

// A task: a header row naming the task, its lines (labor + materials, uniform)
// indented beneath, and a "Task total" row so the lines visibly add up. A
// single-line task collapses to just that line — a header + subtotal around one
// row is only noise.
function GroupRows({ group }: { group: TaskGroup }) {
  if (group.lines.length === 1) {
    return <LineRow line={group.lines[0]} />;
  }
  return (
    <>
      <tr className="border-b border-slate-100 bg-slate-50/60">
        <td colSpan={4} className="px-4 py-2 font-medium text-slate-800">
          {group.name}
        </td>
      </tr>
      {group.lines.map((line) => (
        <LineRow key={line.id} line={line} indented />
      ))}
      <tr className="border-b border-slate-200">
        <td
          colSpan={3}
          className="px-4 pb-2 pt-1 text-right text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Task total
        </td>
        <td className="px-4 pb-2 pt-1 text-right font-semibold text-slate-800">
          {formatCurrency(group.total)}
        </td>
      </tr>
    </>
  );
}

// One line item row, uniform for labor (qty in hours) and material (qty + unit).
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
      <td className="px-4 py-2 text-right text-slate-600">
        {formatQuantity(line.quantity)}
        {isLabor ? " hr" : line.unit ? ` ${line.unit}` : ""}
      </td>
      <td className="px-4 py-2 text-right text-slate-600">
        {formatCurrency(line.unitPrice)}
      </td>
      <td className="px-4 py-2 text-right text-slate-700">
        {formatCurrency(line.cost)}
      </td>
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
    <div className="w-full space-y-1 rounded-lg border border-slate-200 p-4 text-sm shadow-sm">
      <h2 className="mb-2 text-sm font-medium text-slate-600">Estimate</h2>
      {row("Direct cost", totals.directCost)}
      {row(`Overhead (${estimate.overheadRate}%)`, totals.overhead)}
      {row(`Profit (${estimate.profitRate}%)`, totals.profit)}
      {row(`Tax (${estimate.taxRate}%)`, totals.tax)}
      {row("Total", totals.total, true)}
    </div>
  );
}
