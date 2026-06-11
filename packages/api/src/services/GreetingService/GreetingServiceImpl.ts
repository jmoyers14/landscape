import { inject, injectable } from "tsyringe";
import { CONFIG_SERVICE_TOKEN } from "../tokens.ts";
import type { ConfigService } from "../ConfigService/ConfigService.ts";
import type { Greeting, GreetingService } from "./GreetingService.ts";

/**
 * Example stub service. Holds state in memory (no database yet) and demonstrates
 * constructor injection of another service via @inject + its token.
 */
@injectable()
export class GreetingServiceImpl implements GreetingService {
  private readonly greetings: Greeting[] = [];
  private nextId = 1;

  constructor(
    @inject(CONFIG_SERVICE_TOKEN) private readonly config: ConfigService,
  ) {}

  greet(name: string): string {
    return `Hello, ${name}! (env: ${this.config.environment})`;
  }

  list(): Greeting[] {
    return this.greetings;
  }

  add(message: string): Greeting {
    const greeting: Greeting = { id: String(this.nextId++), message };
    this.greetings.push(greeting);
    return greeting;
  }
}
