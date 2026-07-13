export type Environment = "local" | "staging" | "production";

export interface ServerConfig {
  port: number;
  webUrl: string;
}

export interface ClerkConfig {
  secretKey: string;
}

export interface DatabaseConfig {
  uri: string;
}

export interface MapsConfig {
  /** Null when no Maps key is configured — the maps feature is then disabled. */
  apiKey: string | null;
}

export interface AnalyticsConfig {
  /** Null when no key is set — analytics capture then becomes a no-op. */
  apiKey: string | null;
  host: string;
}

/**
 * Identifies exactly which build is running. Stamped into the image at build
 * time by deploy.sh, so the number a user reads off the app traces back to a
 * single commit. Defaults are placeholders for local/unstamped runs.
 */
export interface BuildConfig {
  /** Human-facing app version from the root package.json (e.g. "1.0.0"). */
  version: string;
  /** Short git SHA of the built commit ("-dirty" suffixed if the tree wasn't clean). */
  commit: string;
  /** ISO-8601 UTC timestamp of when the image was built. */
  builtAt: string;
}

export interface ConfigService {
  environment: Environment;
  getServer(): ServerConfig;
  getClerk(): ClerkConfig;
  getDatabase(): DatabaseConfig;
  getMaps(): MapsConfig;
  getAnalytics(): AnalyticsConfig;
  getBuild(): BuildConfig;
}
