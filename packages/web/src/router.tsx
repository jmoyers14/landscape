import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./screens/RootLayout.tsx";
import { ProjectsScreen } from "./screens/ProjectsScreen.tsx";
import { ProjectDetailScreen } from "./screens/ProjectDetailScreen.tsx";
import { CreateProjectScreen } from "./screens/CreateProjectScreen.tsx";
import { EstimateEditorScreen } from "./screens/EstimateEditorScreen.tsx";
import { ClientsScreen } from "./screens/ClientsScreen.tsx";
import { CreateClientScreen } from "./screens/CreateClientScreen.tsx";

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

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectDetailScreen,
});

const estimateEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/estimates/$estimateId",
  component: EstimateEditorScreen,
});

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients",
  component: ClientsScreen,
});

const newClientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/clients/new",
  component: CreateClientScreen,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  newProjectRoute,
  projectDetailRoute,
  estimateEditorRoute,
  clientsRoute,
  newClientRoute,
]);

export const router = createRouter({ routeTree });

// Register the router instance so Link/useNavigate get fully typed paths.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
