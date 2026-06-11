import { useState } from "react";
import {
  CreateOrganization,
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useOrganization,
} from "@clerk/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, trpc } from "./trpc.ts";

const Header = () => (
  <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
    <div>
      <span className="text-lg font-bold text-slate-800">Landscape</span>
      <span className="ml-2 text-sm text-slate-500">for landscaping teams</span>
    </div>
    <div className="flex items-center gap-3">
      <Show when="signed-out">
        <SignInButton mode="modal" />
        <SignUpButton mode="modal" />
      </Show>
      <Show when="signed-in">
        <OrganizationSwitcher afterCreateOrganizationUrl="/" />
        <UserButton />
      </Show>
    </div>
  </header>
);

const SignedOutHero = () => (
  <div className="mx-auto max-w-xl p-8 text-center">
    <h1 className="text-2xl font-bold text-slate-800">
      Run your landscaping business
    </h1>
    <p className="mt-2 text-slate-500">
      Sign in or create an account to get started. Each business gets its own
      organization and can invite its team.
    </p>
  </div>
);

const Workspace = () => {
  const [name, setName] = useState("");
  const items = useQuery(trpc.items.list.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.items.list.queryKey() });

  const create = useMutation(
    trpc.items.create.mutationOptions({
      onSuccess: () => {
        invalidate();
        setName("");
      },
    }),
  );
  const remove = useMutation(
    trpc.items.remove.mutationOptions({ onSuccess: invalidate }),
  );

  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Items</h2>
        <p className="text-sm text-slate-500">
          Stored in MongoDB, scoped to your active organization. Switch orgs to
          see each business's own items.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <input
          className="flex-1 rounded border border-slate-300 px-3 py-2"
          placeholder="Add an item…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="rounded bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
          type="submit"
          disabled={create.isPending}
        >
          Add
        </button>
      </form>

      {items.isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : items.data && items.data.length > 0 ? (
        <ul className="space-y-1">
          {items.data.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded bg-slate-100 px-3 py-2"
            >
              <span className="text-slate-800">{item.name}</span>
              <button
                className="text-sm text-slate-400 hover:text-red-600"
                onClick={() => remove.mutate({ id: item.id })}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-400">No items yet — add one above.</p>
      )}
    </div>
  );
};

const SignedInApp = () => {
  const { organization, isLoaded } = useOrganization();

  if (!isLoaded) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }

  // B2B: a user must belong to an organization (their business) to do anything.
  if (!organization) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-bold text-slate-800">
          Create your organization
        </h1>
        <p className="mt-1 mb-4 text-slate-500">
          Set up your landscaping business to continue. You can invite your team
          afterward.
        </p>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </div>
    );
  }

  // Remount when the active org changes so item queries refetch for the new org.
  return <Workspace key={organization.id} />;
};

export const App = () => {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Show when="signed-out">
        <SignedOutHero />
      </Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </div>
  );
};
