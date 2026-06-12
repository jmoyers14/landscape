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

export interface ConfigService {
  environment: Environment;
  getServer(): ServerConfig;
  getClerk(): ClerkConfig;
  getDatabase(): DatabaseConfig;
  getMaps(): MapsConfig;
}
