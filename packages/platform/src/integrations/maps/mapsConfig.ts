import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

export interface MapsConfig {
  /** Null when no Maps key is configured — the maps feature is then disabled. */
  apiKey: string | null;
}

export const MAPS_CONFIG_TOKEN = "MapsConfig";

// Optional: the property-image + address features are simply unavailable
// without a key, so a deploy that hasn't set one still boots.
const schema = z.object({
  apiKey: z.string().min(1).nullish().transform((v) => v ?? null),
});

export function loadMapsConfig(): MapsConfig {
  return parseConfig("maps", schema, {
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
  });
}
