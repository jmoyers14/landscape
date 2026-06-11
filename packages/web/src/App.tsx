import {
  CreateOrganization,
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useOrganization,
} from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "./trpc.ts";

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
  const me = useQuery(trpc.auth.me.queryOptions());

  return (
    <div className="mx-auto max-w-xl space-y-8 p-8">
      <section>
        <h2 className="text-lg font-semibold text-slate-800">
          Your authenticated session
        </h2>
        <pre className="mt-2 overflow-x-auto rounded bg-slate-100 p-3 text-sm text-slate-700">
          {me.isLoading ? "…" : JSON.stringify(me.data, null, 2)}
        </pre>
        <p className="mt-1 text-xs text-slate-400">
          Returned by the org-scoped <code>auth.me</code> tRPC procedure after
          verifying your Clerk token on the backend.
        </p>
      </section>
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

  return <Workspace />;
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
