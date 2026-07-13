import "reflect-metadata";
import mongoose from "mongoose";
import { container } from "../services/index.ts";
import { CONFIG_SERVICE_TOKEN } from "@landscape/platform";
import {
  ASSEMBLY_REPOSITORY_TOKEN,
  MATERIAL_REPOSITORY_TOKEN,
  PRICING_SETTINGS_REPOSITORY_TOKEN,
} from "@landscape/platform";
import { connectDatabase } from "@landscape/platform/server";
import type { ConfigService } from "@landscape/platform";
import type { MaterialRepository } from "@landscape/platform";
import type { AssemblyRepository } from "@landscape/platform";
import type { PricingSettingsRepository } from "@landscape/platform";
import { seedOrg } from "./seedOrg.ts";

/**
 * Dev script: populate an org's catalog with the starter data (Package sheet).
 *   bun run --cwd packages/api seed <orgId>     (or set SEED_ORG_ID)
 */
const orgId = process.argv[2] ?? process.env.SEED_ORG_ID;
if (!orgId) {
  console.error(
    "Usage: bun run --cwd packages/api seed <orgId>  (or set SEED_ORG_ID)",
  );
  process.exit(1);
}

const config = container.resolve<ConfigService>(CONFIG_SERVICE_TOKEN);
await connectDatabase(config.getDatabase().uri);
console.log("Connected to MongoDB");

await seedOrg(orgId, {
  materials: container.resolve<MaterialRepository>(MATERIAL_REPOSITORY_TOKEN),
  assemblies: container.resolve<AssemblyRepository>(ASSEMBLY_REPOSITORY_TOKEN),
  pricingSettings: container.resolve<PricingSettingsRepository>(
    PRICING_SETTINGS_REPOSITORY_TOKEN,
  ),
});

console.log(`Seeded starter catalog for org ${orgId}`);
await mongoose.disconnect();
