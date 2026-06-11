import { injectable } from "tsyringe";
import { z } from "zod";
import type {
  ConfigService,
  Environment,
  ServerConfig,
} from "./ConfigService.ts";

const envSchema = z.object({
  environment: z
    .enum(["local", "staging", "production"])
    .default("local"),
  port: z.coerce.number().default(3000),
  webUrl: z.string().url().default("http://localhost:5173"),
});

@injectable()
export class ConfigServiceImpl implements ConfigService {
  public readonly environment: Environment;
  private readonly config: z.infer<typeof envSchema>;

  constructor() {
    const result = envSchema.safeParse({
      environment: process.env.ENVIRONMENT,
      port: process.env.PORT,
      webUrl: process.env.WEB_URL,
    });

    if (!result.success) {
      console.error("Configuration errors:");
      result.error.issues.forEach((issue) => {
        console.error(`  ${issue.path.join(".")}: ${issue.message}`);
      });
      process.exit(1);
    }

    this.config = result.data;
    this.environment = result.data.environment;
  }

  getServer(): ServerConfig {
    return {
      port: this.config.port,
      webUrl: this.config.webUrl,
    };
  }
}
