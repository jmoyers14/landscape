import { useEffect } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import {
  CreateOrganization,
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useOrganization,
} from "@clerk/react";
import { queryClient } from "../trpc.ts";

const Header = () => (
  <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
    <div className="flex items-center gap-6">
      <span className="text-lg font-bold text-slate-800">Landscape</span>
      <Show when="signed-in">
        <nav className="flex gap-4 text-sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="text-slate-500 hover:text-slate-800"
            activeProps={{ className: "text-slate-900 font-medium" }}
          >
            Projects
          </Link>
          <Link
            to="/clients"
            className="text-slate-500 hover:text-slate-800"
            activeProps={{ className: "text-slate-900 font-medium" }}
          >
            Clients
          </Link>
        </nav>
      </Show>
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

const SignedInArea = () => {
  const { organization, isLoaded } = useOrganization();

  // On org switch, drop cached data so queries refetch for the new tenant.
  useEffect(() => {
    queryClient.invalidateQueries();
  }, [organization?.id]);

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

  return <Outlet />;
};

export function RootLayout() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Show when="signed-out">
        <SignedOutHero />
      </Show>
      <Show when="signed-in">
        <SignedInArea />
      </Show>
    </div>
  );
}
