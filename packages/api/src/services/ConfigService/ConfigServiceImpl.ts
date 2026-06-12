import { injectable } from "tsyringe";
import { z } from "zod";
import type {
  ClerkConfig,
  ConfigService,
  DatabaseConfig,
  Environment,
  MapsConfig,
  ServerConfig,
} from "./ConfigService.ts";

const envSchema = z.object({
  environment: z
    .enum(["local", "staging", "production"])
    .default("local"),
  port: z.coerce.number().default(3000),
  webUrl: z.string().url().default("http://localhost:5173"),
  clerkSecretKey: z.string().min(1),
  mongodbUri: z.string().min(1),
  // Optional: the property-image feature is simply unavailable without it, so a
  // deploy that hasn't set the key still boots.
  googleMapsApiKey: z.string().min(1).optional(),
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
      clerkSecretKey: process.env.CLERK_SECRET_KEY,
      mongodbUri: process.env.MONGODB_URI,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
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

  getClerk(): ClerkConfig {
    return {
      secretKey: this.config.clerkSecretKey,
    };
  }

  getDatabase(): DatabaseConfig {
    return {
      uri: this.config.mongodbUri,
    };
  }

  getMaps(): MapsConfig {
    return {
      apiKey: this.config.googleMapsApiKey ?? null,
    };
  }
}
