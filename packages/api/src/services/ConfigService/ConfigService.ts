export type Environment = "local" | "staging" | "production";

export interface ServerConfig {
  port: number;
  webUrl: string;
}

export interface ClerkConfig {
  secretKey: string;
}

export interface ConfigService {
  environment: Environment;
  getServer(): ServerConfig;
  getClerk(): ClerkConfig;
}
