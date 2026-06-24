import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";

export function CreateClientScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const create = useMutation(
    trpc.clients.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.clients.list.queryKey(),
        });
        navigate({ to: "/clients" });
      },
      onError: (e) => setError(e.message),
    }),
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    create.mutate({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    });
  };

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">New Client</h1>
        <Link
          to="/clients"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-2">
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
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-light disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create Client"}
          </button>
          <Link
            to="/clients"
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </Page>
  );
}
