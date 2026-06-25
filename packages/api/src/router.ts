import { router } from "./trpc.ts";
import { clientsRouter } from "./routers/clients.ts";
import { projectsRouter } from "./routers/projects.ts";
import { estimatesRouter } from "./routers/estimates.ts";
import { authRouter } from "./routers/auth.ts";
import { addressRouter } from "./routers/address.ts";
import { pricingSettingsRouter } from "./routers/pricingSettings.ts";
import { materialsRouter } from "./routers/materials.ts";

export const appRouter = router({
  clients: clientsRouter,
  projects: projectsRouter,
  estimates: estimatesRouter,
  auth: authRouter,
  address: addressRouter,
  pricingSettings: pricingSettingsRouter,
  materials: materialsRouter,
});

export type AppRouter = typeof appRouter;
