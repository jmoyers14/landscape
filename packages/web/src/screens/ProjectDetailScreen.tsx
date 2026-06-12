import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass } from "../components/ui.tsx";
import { formatCurrency } from "../lib/format.ts";
import {
  NEXT_STATUSES,
  STATUS_LABEL,
  type ProjectStatus,
} from "../lib/projectStatus.ts";

export function ProjectDetailScreen() {
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const project = useQuery(trpc.projects.get.queryOptions({ id: projectId }));

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.projects.get.queryKey({ id: projectId }),
    });
    queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
  };

  const update = useMutation(
    trpc.projects.update.mutationOptions({
      onSuccess: () => {
        invalidate();
        setEditing(false);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );
  const changeStatus = useMutation(
    trpc.projects.changeStatus.mutationOptions({
      onSuccess: () => {
        invalidate();
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );
  const remove = useMutation(
    trpc.projects.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.projects.list.queryKey(),
        });
        navigate({ to: "/" });
      },
      onError: (e) => setError(e.message),
    }),
  );

  const estimates = useQuery(
    trpc.estimates.listByProject.queryOptions({ projectId }),
  );
  const createEstimate = useMutation(
    trpc.estimates.create.mutationOptions({
      onSuccess: (estimate) => {
        queryClient.invalidateQueries({
          queryKey: trpc.estimates.listByProject.queryKey({ projectId }),
        });
        navigate({
          to: "/projects/$projectId/estimates/$estimateId",
          params: { projectId, estimateId: estimate.id },
        });
      },
      onError: (e) => setError(e.message),
    }),
  );

  if (project.isLoading) {
    return <div className="mx-auto max-w-2xl p-8 text-slate-400">Loading…</div>;
  }

  if (!project.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← Projects
        </Link>
        <p className="text-slate-500">Project not found.</p>
      </div>
    );
  }

  const data = project.data;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Projects
      </Link>

      <ErrorNote message={error} />

      {editing ? (
        <EditForm
          project={data}
          pending={update.isPending}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSave={(input) => update.mutate({ id: projectId, ...input })}
        />
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{data.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {data.clientName ?? "Unknown client"} · created{" "}
                {new Date(data.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
              {STATUS_LABEL[data.status]}
            </span>
          </div>

          <dl className="space-y-3 rounded-lg border border-slate-200 p-4 shadow-sm">
            <Field label="Location" value={data.location} />
            <Field label="Description" value={data.description} />
          </dl>

          <div className="space-y-2">
            <h2 className="text-sm font-medium text-slate-600">Status</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">
                {STATUS_LABEL[data.status]}
              </span>
              {NEXT_STATUSES[data.status].length > 0 ? (
                NEXT_STATUSES[data.status].map((next) => (
                  <button
                    key={next}
                    disabled={changeStatus.isPending}
                    onClick={() =>
                      changeStatus.mutate({ id: projectId, status: next })
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    → {STATUS_LABEL[next]}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400">
                  No further transitions
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 border-t border-slate-200 pt-4">
            <button
              onClick={() => setEditing(true)}
              className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-light"
            >
              Edit
            </button>
            <button
              onClick={() => remove.mutate({ id: projectId })}
              disabled={remove.isPending}
              className="rounded border border-slate-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </div>

          <section className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-600">Estimates</h2>
              <button
                onClick={() => createEstimate.mutate({ projectId })}
                disabled={createEstimate.isPending}
                className="rounded bg-gold px-3 py-1.5 text-sm font-medium text-white hover:bg-gold-light disabled:opacity-50"
              >
                New estimate
              </button>
            </div>

            {estimates.isLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : estimates.data && estimates.data.length > 0 ? (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                {estimates.data.map((estimate) => (
                  <li key={estimate.id}>
                    <Link
                      to="/projects/$projectId/estimates/$estimateId"
                      params={{ projectId, estimateId: estimate.id }}
                      className="flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-800">
                        {estimate.title}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize">
                          {estimate.status}
                        </span>
                        <span className="text-slate-600">
                          {formatCurrency(estimate.total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">
                No estimates yet. Click{" "}
                <span className="font-medium">New estimate</span> to start one.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-slate-700">
        {value || <span className="text-slate-400">—</span>}
      </dd>
    </div>
  );
}

function EditForm({
  project,
  pending,
  onCancel,
  onSave,
}: {
  project: { name: string; location: string | null; description: string | null };
  pending: boolean;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    location: string | null;
    description: string | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: project.name,
    location: project.location ?? "",
    description: project.description ?? "",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        className={inputClass}
        placeholder="Project name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Location"
        value={form.location}
        onChange={(e) => setForm({ ...form, location: e.target.value })}
      />
      <textarea
        className={inputClass}
        placeholder="Description"
        rows={3}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-light disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
