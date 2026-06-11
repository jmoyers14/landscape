import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass } from "../components/ui.tsx";

export function ClientsScreen() {
  const empty = { name: "", email: "", phone: "", address: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const clients = useQuery(trpc.clients.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.clients.list.queryKey() });

  const create = useMutation(
    trpc.clients.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        setForm(empty);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );
  const remove = useMutation(
    trpc.clients.remove.mutationOptions({
      onSuccess: () => {
        invalidate();
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    create.mutate({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-bold text-slate-800">Clients</h1>
      <ErrorNote message={error} />

      <form
        onSubmit={submit}
        className="grid grid-cols-2 gap-2 rounded border border-slate-200 p-4"
      >
        <input
          className={inputClass}
          placeholder="Name *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className={inputClass}
          placeholder="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="col-span-2 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add client
        </button>
      </form>

      {clients.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : clients.data && clients.data.length > 0 ? (
        <ul className="space-y-1">
          {clients.data.map((client) => (
            <li
              key={client.id}
              className="flex items-center justify-between rounded bg-slate-100 px-3 py-2"
            >
              <div>
                <span className="font-medium text-slate-800">{client.name}</span>
                {client.email && (
                  <span className="ml-2 text-sm text-slate-500">
                    {client.email}
                  </span>
                )}
              </div>
              <button
                onClick={() => remove.mutate({ id: client.id })}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-400">No clients yet — add one above.</p>
      )}
    </div>
  );
}
