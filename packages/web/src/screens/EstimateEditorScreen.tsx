import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@landscape/api";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { formatCurrency } from "../lib/format.ts";

type RouterOutput = inferRouterOutputs<AppRouter>;
type EstimateView = NonNullable<RouterOutput["estimates"]["get"]>;
type LineItemView = EstimateView["lineItems"][number];
type LineItemType = LineItemView["type"];
type EstimateStatus = EstimateView["status"];

const LINE_ITEM_TYPES = [
  "material",
  "labor",
  "equipment",
  "other",
] as const satisfies readonly LineItemType[];

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

const PHASES = [
  "General Condition",
  "Demolition",
  "Drainage",
  "Irrigation",
  "Soil Preparation",
  "Planting",
  "Lawn Borders",
  "Lighting/Electrical",
  "Gravel/Boulders/Steppers",
  "Carpentry",
  "Concrete",
  "Masonry: Walls",
  "Masonry: Paving",
  "Gas Line and Fire Ring",
  "Water Features: Pre Fab",
  "Water Features: Others",
] as const;

const phaseLabel = (phase: string | null) => phase || "General";

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
  const addLineItem = useMutation(
    trpc.estimates.addLineItem.mutationOptions({
      onSuccess: onMutated,
      onError,
    }),
  );
  const updateLineItem = useMutation(
    trpc.estimates.updateLineItem.mutationOptions({
      onSuccess: onMutated,
      onError,
    }),
  );
  const removeLineItem = useMutation(
    trpc.estimates.removeLineItem.mutationOptions({
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

      <RatesEditor
        key={`rates-${data.id}`}
        estimate={data}
        onCommit={(changes) =>
          updateMeta.mutate({ id: estimateId, ...changes })
        }
      />

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-slate-600">Line items</h2>

        {data.lineItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            No line items yet — add one below.
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
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                      <th className="px-4 py-1.5 font-medium">Description</th>
                      <th className="px-4 py-1.5 font-medium">Type</th>
                      <th className="px-4 py-1.5 text-right font-medium">
                        Qty
                      </th>
                      <th className="px-4 py-1.5 text-right font-medium">
                        Unit price
                      </th>
                      <th className="px-4 py-1.5 text-right font-medium">
                        Total
                      </th>
                      <th className="px-4 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {(itemsByPhase.get(phase.phase) ?? []).map((item) => (
                      <LineItemRow
                        key={item.id}
                        item={item}
                        busy={
                          updateLineItem.isPending || removeLineItem.isPending
                        }
                        onSave={(input) =>
                          updateLineItem.mutate({
                            id: estimateId,
                            lineItemId: item.id,
                            item: { ...input, phase: item.phase },
                          })
                        }
                        onRemove={() =>
                          removeLineItem.mutate({
                            id: estimateId,
                            lineItemId: item.id,
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}

        <AddLineItemForm
          busy={addLineItem.isPending}
          onAdd={(item) => addLineItem.mutate({ id: estimateId, item })}
        />
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

function RatesEditor({
  estimate,
  onCommit,
}: {
  estimate: EstimateView;
  onCommit: (changes: {
    overheadRate?: number;
    profitRate?: number;
    taxRate?: number;
  }) => void;
}) {
  const [overhead, setOverhead] = useState(String(estimate.overheadRate));
  const [profit, setProfit] = useState(String(estimate.profitRate));
  const [tax, setTax] = useState(String(estimate.taxRate));

  const field = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    commit: (n: number) => void,
  ) => (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      {label}
      <div className="flex items-center">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => commit(Number(value) || 0)}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-sm"
        />
        <span className="ml-1 text-slate-400">%</span>
      </div>
    </label>
  );

  return (
    <div className="flex flex-wrap gap-6 rounded-lg border border-slate-200 p-4 shadow-sm">
      {field("Overhead", overhead, setOverhead, (n) =>
        onCommit({ overheadRate: n }),
      )}
      {field("Profit", profit, setProfit, (n) => onCommit({ profitRate: n }))}
      {field("Tax", tax, setTax, (n) => onCommit({ taxRate: n }))}
    </div>
  );
}

type LineItemFormValue = {
  type: LineItemType;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
};

function LineItemRow({
  item,
  busy,
  onSave,
  onRemove,
}: {
  item: LineItemView;
  busy: boolean;
  onSave: (input: LineItemFormValue) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    type: item.type,
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
    unitPrice: String(item.unitPrice),
  });

  if (!editing) {
    return (
      <tr className="border-b border-slate-100">
        <td className="px-4 py-2 text-slate-800">{item.description}</td>
        <td className="px-4 py-2 text-slate-500">{TYPE_LABEL[item.type]}</td>
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
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button
            onClick={() => setEditing(true)}
            className="text-slate-400 hover:text-slate-700"
          >
            Edit
          </button>
          <button
            onClick={onRemove}
            className="ml-3 text-slate-400 hover:text-red-600"
          >
            Delete
          </button>
        </td>
      </tr>
    );
  }

  const save = () => {
    if (!form.description.trim()) {
      return;
    }
    onSave({
      type: form.type,
      description: form.description.trim(),
      quantity: Number(form.quantity) || 0,
      unit: form.unit.trim() || null,
      unitPrice: Number(form.unitPrice) || 0,
    });
    setEditing(false);
  };

  return (
    <tr className="border-b border-slate-100 bg-slate-50">
      <td className="px-4 py-2">
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </td>
      <td className="px-4 py-2">
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={form.type}
          onChange={(e) =>
            setForm({ ...form, type: e.target.value as LineItemType })
          }
        >
          {LINE_ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
          <input
            className="w-14 rounded border border-slate-300 px-2 py-1 text-sm"
            placeholder="unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
        </div>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          min={0}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"
          value={form.unitPrice}
          onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
        />
      </td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2 text-right whitespace-nowrap">
        <button
          onClick={save}
          disabled={busy}
          className="text-slate-700 hover:text-slate-900 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="ml-3 text-slate-400 hover:text-slate-700"
        >
          Cancel
        </button>
      </td>
    </tr>
  );
}

function AddLineItemForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (item: LineItemFormValue & { phase: string | null }) => void;
}) {
  const empty = {
    phase: "",
    type: "material" as LineItemType,
    description: "",
    quantity: "",
    unit: "",
    unitPrice: "",
  };
  const [form, setForm] = useState(empty);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) {
      return;
    }
    onAdd({
      phase: form.phase.trim() || null,
      type: form.type,
      description: form.description.trim(),
      quantity: Number(form.quantity) || 0,
      unit: form.unit.trim() || null,
      unitPrice: Number(form.unitPrice) || 0,
    });
    setForm(empty);
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-3"
    >
      <select
        className={inputClass}
        value={form.phase}
        onChange={(e) => setForm({ ...form, phase: e.target.value })}
      >
        <option value="">Phase…</option>
        {PHASES.map((phase) => (
          <option key={phase} value={phase}>
            {phase}
          </option>
        ))}
      </select>
      <select
        className={inputClass}
        value={form.type}
        onChange={(e) =>
          setForm({ ...form, type: e.target.value as LineItemType })
        }
      >
        {LINE_ITEM_TYPES.map((type) => (
          <option key={type} value={type}>
            {TYPE_LABEL[type]}
          </option>
        ))}
      </select>
      <input
        className={inputClass}
        placeholder="Description *"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <input
        type="number"
        min={0}
        className={inputClass}
        placeholder="Quantity"
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Unit (e.g. sq ft)"
        value={form.unit}
        onChange={(e) => setForm({ ...form, unit: e.target.value })}
      />
      <input
        type="number"
        min={0}
        className={inputClass}
        placeholder="Unit price"
        value={form.unitPrice}
        onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
      />
      <button
        type="submit"
        disabled={busy}
        className="col-span-2 rounded bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-light disabled:opacity-50 sm:col-span-3"
      >
        Add line item
      </button>
    </form>
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
