export type Environment = "local" | "staging" | "production";

export interface ServerConfig {
  port: number;
  webUrl: string;
}

export interface ConfigService {
  environment: Environment;
  getServer(): ServerConfig;
}
