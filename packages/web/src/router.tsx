import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./screens/RootLayout.tsx";
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
import { CreateProjectScreen } from "./screens/CreateProjectScreen.tsx";
import { ClientsScreen } from "./screens/ClientsScreen.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsScreen,
});

const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/new",
  component: CreateProjectScreen,
});

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: ClientsScreen,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  newProjectRoute,
  clientsRoute,
]);

export const router = createRouter({ routeTree });

// Register the router instance so Link/useNavigate get fully typed paths.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
