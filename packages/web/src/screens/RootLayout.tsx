import { useEffect } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import {
  CreateOrganization,
  OrganizationSwitcher,
  Show,
  UserButton,
  useOrganization,
} from "@clerk/react";
import { queryClient } from "../trpc.ts";
import { Page } from "../components/ui.tsx";
import { LandingScreen } from "./LandingScreen.tsx";

const Header = () => (
  <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 bg-primary-900 px-4 py-3 md:px-6">
    <div className="flex items-center gap-4 md:gap-6">
      <span className="font-heading text-lg tracking-wide text-grey-50">
        Land<span className="text-primary-300">scape</span>
      </span>
      <nav className="flex gap-4 text-sm">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className="text-primary-200 transition-colors hover:text-grey-50"
          activeProps={{ className: "text-white font-medium" }}
        >
          Projects
        </Link>
        <Link
          to="/clients"
          className="text-primary-200 transition-colors hover:text-grey-50"
          activeProps={{ className: "text-white font-medium" }}
        >
          Clients
        </Link>
      </nav>
    </div>
    <div className="flex items-center gap-3">
      <OrganizationSwitcher
        afterCreateOrganizationUrl="/"
        appearance={{
          elements: {
            organizationSwitcherTrigger:
              "text-grey-50 hover:bg-white/10 rounded-md",
            organizationPreviewMainIdentifier: "text-grey-50",
          },
        }}
      />
      <UserButton />
    </div>
  </header>
);

const SignedInArea = () => {
  const { organization, isLoaded } = useOrganization();

  // On org switch, drop cached data so queries refetch for the new tenant.
  useEffect(() => {
    queryClient.invalidateQueries();
  }, [organization?.id]);

  if (!isLoaded) {
    return <div className="p-4 text-slate-400 md:p-8">Loading…</div>;
  }

  // B2B: a user must belong to an organization (their business) to do anything.
  if (!organization) {
    return (
      <Page max="xl">
        <h1 className="text-xl font-bold text-slate-800">
          Create your organization
        </h1>
        <p className="mt-1 mb-4 text-slate-500">
          Set up your landscaping business to continue. You can invite your team
          afterward.
        </p>
        <CreateOrganization afterCreateOrganizationUrl="/" />
      </Page>
    );
  }

  return <Outlet />;
};

export function RootLayout() {
  return (
    <>
      <Show when="signed-out">
        <LandingScreen />
      </Show>
      <Show when="signed-in">
        <div className="min-h-screen bg-white">
          <Header />
          <SignedInArea />
        </div>
      </Show>
    </>
  );
}
