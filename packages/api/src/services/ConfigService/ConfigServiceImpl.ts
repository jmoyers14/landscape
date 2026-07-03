import { injectable } from "tsyringe";
import { z } from "zod";
import type {
  AnalyticsConfig,
  BuildConfig,
  ClerkConfig,
  ConfigService,
  DatabaseConfig,
  Environment,
  MapsConfig,
  ServerConfig,
} from "./ConfigService.ts";

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

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
  // Optional: PostHog's project key is public (write-only ingestion). Without
  // it, analytics capture is a no-op and the server still boots.
  posthogApiKey: z.string().min(1).optional(),
  posthogHost: z.string().url().default(DEFAULT_POSTHOG_HOST),
  // Build stamp injected by deploy.sh. Defaults keep local/unstamped runs
  // booting; in a deployed image these are always set.
  appVersion: z.string().default("0.0.0"),
  gitSha: z.string().default("unknown"),
  builtAt: z.string().default("unknown"),
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
      posthogApiKey: process.env.POSTHOG_API_KEY,
      posthogHost: process.env.POSTHOG_HOST,
      appVersion: process.env.APP_VERSION,
      gitSha: process.env.GIT_SHA,
      builtAt: process.env.BUILT_AT,
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

  getAnalytics(): AnalyticsConfig {
    return {
      apiKey: this.config.posthogApiKey ?? null,
      host: this.config.posthogHost,
    };
  }

  getBuild(): BuildConfig {
    return {
      version: this.config.appVersion,
      commit: this.config.gitSha,
      builtAt: this.config.builtAt,
    };
  }
}
