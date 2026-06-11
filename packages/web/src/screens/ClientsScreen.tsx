import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote } from "../components/ui.tsx";

export function ClientsScreen() {
  const [error, setError] = useState<string | null>(null);
  const clients = useQuery(trpc.clients.list.queryOptions());

  const remove = useMutation(
    trpc.clients.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.clients.list.queryKey(),
        });
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Clients</h1>
        <Link
          to="/clients/new"
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Create Client
        </Link>
      </div>

      <ErrorNote message={error} />

      {clients.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : clients.data && clients.data.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {clients.data.map((client) => (
                <tr key={client.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {client.name}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {client.email ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {client.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {client.address ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove.mutate({ id: client.id })}
                      className="text-slate-400 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No clients yet. Click{" "}
          <span className="font-medium">Create Client</span> to add your first
          one.
        </div>
      )}
    </div>
  );
}
