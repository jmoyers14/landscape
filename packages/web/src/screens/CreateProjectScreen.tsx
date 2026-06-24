import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "../trpc.ts";
import { ErrorNote, inputClass, Page } from "../components/ui.tsx";
import { AddressAutocomplete } from "../components/AddressAutocomplete.tsx";

export function CreateProjectScreen() {
  const navigate = useNavigate();
  const clients = useQuery(trpc.clients.list.queryOptions());
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [project, setProject] = useState({
    name: "",
    location: "",
    description: "",
  });
  const [clientId, setClientId] = useState("");
  const [contact, setContact] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const createClient = useMutation(trpc.clients.create.mutationOptions());
  const createProject = useMutation(trpc.projects.create.mutationOptions());
  const submitting = createClient.isPending || createProject.isPending;

  // If the org has no contacts yet, the only path is to add one inline.
  useEffect(() => {
    if (clients.data && clients.data.length === 0) {
      setMode("new");
    }
  }, [clients.data]);

  const hasClients = (clients.data?.length ?? 0) > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!project.name.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      let resolvedClientId = clientId;

      // Create the contact inline first, then attach the project to it.
      if (mode === "new") {
        if (!contact.name.trim()) {
          setError("Contact name is required");
          return;
        }
        const client = await createClient.mutateAsync({
          name: contact.name.trim(),
          email: contact.email.trim() || null,
          phone: contact.phone.trim() || null,
          address: contact.address.trim() || null,
        });
        resolvedClientId = client.id;
      } else if (!resolvedClientId) {
        setError("Choose a contact, or add a new one");
        return;
      }

      await createProject.mutateAsync({
        name: project.name.trim(),
        location: project.location.trim() || null,
        clientId: resolvedClientId,
        description: project.description.trim() || null,
      });

      queryClient.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.clients.list.queryKey() });
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <Page max="xl" className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">New Project</h1>
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back
        </Link>
      </div>

      <ErrorNote message={error} />

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <input
            className={inputClass}
            placeholder="Project name *"
            value={project.name}
            onChange={(e) => setProject({ ...project, name: e.target.value })}
          />
          <AddressAutocomplete
            placeholder="Location"
            value={project.location}
            onChange={(location) => setProject({ ...project, location })}
          />
          <textarea
            className={inputClass}
            placeholder="Description"
            rows={3}
            value={project.description}
            onChange={(e) =>
              setProject({ ...project, description: e.target.value })
            }
          />
        </div>

        <fieldset className="space-y-2 rounded border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-600">
            Contact
          </legend>

          {mode === "existing" ? (
            <>
              <select
                className={inputClass}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Select a contact *</option>
                {clients.data?.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setMode("new")}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                + Contact not listed? Add a new one
              </button>
            </>
          ) : (
            <>
              <input
                className={inputClass}
                placeholder="Contact name *"
                value={contact.name}
                onChange={(e) =>
                  setContact({ ...contact, name: e.target.value })
                }
              />
              <input
                className={inputClass}
                placeholder="Email"
                value={contact.email}
                onChange={(e) =>
                  setContact({ ...contact, email: e.target.value })
                }
              />
              <input
                className={inputClass}
                placeholder="Phone"
                value={contact.phone}
                onChange={(e) =>
                  setContact({ ...contact, phone: e.target.value })
                }
              />
              <input
                className={inputClass}
                placeholder="Address"
                value={contact.address}
                onChange={(e) =>
                  setContact({ ...contact, address: e.target.value })
                }
              />
              {hasClients && (
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Use an existing contact instead
                </button>
              )}
            </>
          )}
        </fieldset>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-gold px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-light disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Project"}
          </button>
          <Link
            to="/"
            className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </Page>
  );
}
