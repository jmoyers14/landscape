import type { GreetingService } from "./services/GreetingService/GreetingService.ts";

/**
 * Request context type. This module imports only service *interfaces* (no DI
 * container, decorators, or runtime globals) so the client can consume the
 * AppRouter type without pulling the server implementation into its compile.
 */
export interface Context {
  services: {
    greetingService: GreetingService;
  };
}
