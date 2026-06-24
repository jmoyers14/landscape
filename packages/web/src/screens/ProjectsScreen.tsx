import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, Page, TableScroll } from "../components/ui.tsx";
import {
  NEXT_STATUSES,
  STATUS_LABEL,
  type ProjectStatus,
} from "../lib/projectStatus.ts";

export function ProjectsScreen() {
  const [error, setError] = useState<string | null>(null);
  const projects = useQuery(trpc.projects.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });

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
        invalidate();
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  return (
    <Page max="4xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Projects</h1>
        <Link
          to="/projects/new"
          className="rounded bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-light"
        >
          Create Project
        </Link>
      </div>

      <ErrorNote message={error} />

      {projects.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : projects.data && projects.data.length > 0 ? (
        <TableScroll>
          <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {projects.data.map((project) => (
              <tr key={project.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="text-slate-800 hover:text-slate-600 hover:underline"
                  >
                    {project.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {project.clientName ?? "—"}
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {project.location ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <StatusSelect
                    status={project.status}
                    onChange={(status) =>
                      changeStatus.mutate({ id: project.id, status })
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => remove.mutate({ id: project.id })}
                    className="text-slate-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableScroll>
      ) : (
        <div className="rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No projects yet. Click{" "}
          <span className="font-medium">Create Project</span> to add your first
          one.
        </div>
      )}
    </Page>
  );
}

function StatusSelect({
  status,
  onChange,
}: {
  status: ProjectStatus;
  onChange: (status: ProjectStatus) => void;
}) {
  // Current status plus the legal moves out of it.
  const options = [status, ...NEXT_STATUSES[status]];
  return (
    <select
      value={status}
      onChange={(e) => {
        const next = e.target.value as ProjectStatus;
        if (next !== status) onChange(next);
      }}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {STATUS_LABEL[option]}
        </option>
      ))}
    </select>
  );
}
