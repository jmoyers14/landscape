import "reflect-metadata";
import mongoose from "mongoose";
import { container } from "../services/index.ts";
import { SEED_SERVICE_TOKEN, type SeedService } from "@landscape/platform";
import {
  connectDatabase,
  DATABASE_CONFIG_TOKEN,
  type DatabaseConfig,
} from "@landscape/platform/server";

/**
 * Dev script: (re)populate an org's catalog with the starter data (Package
 * sheet).
 *   bun run --cwd packages/api seed <orgId>     (or set SEED_ORG_ID)
 *
 * Uses SeedService.resetOrgCatalog — the DESTRUCTIVE path: it clears the org's
 * catalog first so a re-run reproduces exactly the starter set. That's the right
 * behaviour for a dev tool, and the reason this is a CLI and not the webhook
 * path (which uses the non-destructive seedNewOrg).
 */
const orgId = process.argv[2] ?? process.env.SEED_ORG_ID;
if (!orgId) {
  console.error(
    "Usage: bun run --cwd packages/api seed <orgId>  (or set SEED_ORG_ID)",
  );
  process.exit(1);
}

const { uri } = container.resolve<DatabaseConfig>(DATABASE_CONFIG_TOKEN);
await connectDatabase(uri);
console.log("Connected to MongoDB");

const seedService = container.resolve<SeedService>(SEED_SERVICE_TOKEN);
await seedService.resetOrgCatalog(orgId);

console.log(`Reset + seeded starter catalog for org ${orgId}`);
await mongoose.disconnect();
